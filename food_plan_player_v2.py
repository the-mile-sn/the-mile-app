"""Approved Planos prescription adapter for the player app.

Reads the same immutable Planos snapshots as Planeamento. Only role-authorized
player endpoints call this module. No drafts, old PDF imports or app writes.
"""
import json
import math
import unicodedata

FIELDS=("kcal","protein_g","carbs_g","fat_g")
COLORS={"orange":"Plano laranja","yellow":"Plano amarelo",
        "blue":"Plano azul","green":"Plano verde","vp":"Plano verde preparação"}
SLOTS={"breakfast":"pequeno almoco","lunch":"almoco","snack":"lanche",
       "dinner":"jantar","supper":"ceia"}
PERI_KINDS={"training":"Plano Peri-treino","match":"Plano Peri-jogo"}
PERI_NAMES={"pre_training":("pre","Pré-treino"),
            "post_training":("post","Pós-treino"),
            "pre_match":("pre","Pré-jogo"),
            "intra_match":("pre","Intra-jogo"),
            "post_match":("post","Pós-jogo")}


def normalize(value):
    value=unicodedata.normalize("NFD",str(value or "").lower())
    return " ".join("".join(c for c in value
                            if unicodedata.category(c)!="Mn").replace("-"," ").split())


def meal_slots(meal):
    name=normalize(meal.get("name"))
    if name=="intermedia" or ("pequeno almoco" in name and "lanche" in name):
        return ("breakfast","snack")
    if name=="principal" or ("almoco" in name and "jantar" in name):
        return ("lunch","dinner")
    all_names=[name]+[normalize(x) for x in meal.get("applies_to") or []]
    return tuple(key for key,label in SLOTS.items() if label in all_names)


def peri_phase(name,kind):
    key=normalize(name)
    names={"training":{"pre treino":"pre_training","pos treino":"post_training"},
           "match":{"pre jogo":"pre_match","intra jogo":"intra_match",
                    "intrajogo":"intra_match","pos jogo":"post_match"}}
    return names[kind].get(key)


def _zero():
    return {key:0.0 for key in FIELDS}


def _library(c):
    return {r["id"]:dict(r) for r in c.execute(
        "SELECT id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g "
        "FROM v2_food_library WHERE active=1").fetchall()}


def _approved(c,athlete_id):
    athlete=c.execute("SELECT id FROM v2_athletes WHERE id=? AND archived_at IS NULL",
                      (athlete_id,)).fetchone()
    if not athlete:return {}
    linked=c.execute("SELECT user_id FROM v2_player_links WHERE athlete_id=?",
                     (athlete_id,)).fetchone()
    owner=str(linked["user_id"]) if linked else ""
    if not owner:return {}
    rows=c.execute(
        "SELECT plan_type,snapshot_json,published_at FROM "
        "v2_food_plan_editor_publications WHERE athlete_id=? AND state='published'",
        (athlete_id,)).fetchall()
    plans={}
    for row in rows:
        try:plan=json.loads(row["snapshot_json"])
        except (ValueError,TypeError):continue
        if plan.get("athlete_id") and str(plan["athlete_id"])!=str(athlete_id):
            continue
        if plan.get("player_id") and str(plan["player_id"])!=owner:
            continue
        name=row["plan_type"]
        if name not in tuple(COLORS.values())+tuple(PERI_KINDS.values()):
            continue
        plans[name]={"content":plan,"published_at":row["published_at"]}
    return plans


def _food_nutrients(food,library):
    if food.get("kind")=="supplement":return _zero()
    ref=library.get(food.get("id"))
    if ref is None or food.get("grams") is None:raise ValueError("incomplete_published_food")
    grams=float(food["grams"])
    fraction=float(ref["edible_fraction"]) if ref["variant"]=="gross" else 1
    if not math.isfinite(grams) or grams<=0 or not 0<fraction<=1:
        raise ValueError("incomplete_published_food")
    return {k:float(ref[k])*grams*fraction/100 for k in FIELDS}


def _option_totals(option,library):
    foods=option.get("foods") or []
    result=_zero()
    for index,primary in enumerate(foods):
        if primary.get("alternative_to") is not None:continue
        group=[primary]+[f for f in foods if f.get("alternative_to")==index]
        nutrients=[_food_nutrients(f,library) for f in group]
        for k in FIELDS:result[k]+=sum(x[k] for x in nutrients)/len(nutrients)
    return result


def _format_grams(grams):
    value=float(grams)
    return (str(int(value)) if value.is_integer() else
            ("%g"%value).replace(".",","))+" g"


def _option_items(option,library):
    foods=option.get("foods") or []
    notes=option.get("notes") or []
    order=option.get("order") or (
        [{"type":"food","index":i} for i in range(len(foods))]+
        [{"type":"note","index":i} for i in range(len(notes))])
    items=[]
    for position in order:
        index=position.get("index")
        if not isinstance(index,int):continue
        if position.get("type")=="note":
            if 0<=index<len(notes) and str(notes[index]).strip():
                items.append({"kind":"note","text":str(notes[index])})
            continue
        if position.get("type")!="food" or not 0<=index<len(foods):continue
        food=foods[index]
        if food.get("kind")=="supplement":
            items.append({"kind":"note","text":str(food.get("label") or "")})
            continue
        ref=library.get(food.get("id"))
        if not ref:raise ValueError("incomplete_published_food")
        name=food.get("display_name") or ref.get("display_name") or "Alimento"
        quantity=food.get("display_quantity") or _format_grams(food["grams"])
        if food.get("alternative_to") is not None:
            items.append({"kind":"note","text":"ou "+quantity+" · "+name})
        else:
            items.append({"kind":"food","quantity":quantity,"name":name})
    return items


def _options(meal,library):
    result=[]
    for index,option in enumerate(meal.get("options") or [],1):
        result.append({"number":index,"title":option.get("title") or "",
                       "totals":_option_totals(option,library),
                       "items":_option_items(option,library)})
    return result


def _validated_options(meal,library):
    # Fail closed for an unexpected broken published prescription.
    try:return _options(meal,library)
    except (TypeError,KeyError,ValueError,ZeroDivisionError,OverflowError):
        return []


def _colors(plans,library):
    from microcycles_v2 import COLORS as ALL_COLORS,MEALS
    result={c:{m:[] for m in MEALS} for c in ALL_COLORS}
    for color,kind in COLORS.items():
        plan=plans.get(kind)
        if not plan or color not in result:continue
        for meal in plan["content"].get("meals") or []:
            for slot in meal_slots(meal):
                if result[color][slot]:
                    # Never silently combine ambiguous prescriptions.
                    result[color][slot]=[]
                    continue
                result[color][slot]=_validated_options(meal,library)
    return result


def _peri_plans(plans,library):
    result={}
    for kind,plan_type in PERI_KINDS.items():
        entry=plans.get(plan_type)
        if not entry:continue
        phases={"pre":[],"post":[]}
        labels={}
        for meal in entry["content"].get("meals") or []:
            phase=peri_phase(meal.get("name"),kind)
            if not phase:continue
            legacy,label=PERI_NAMES[phase]
            new=_validated_options(meal,library)
            phases[legacy].extend(new)
            labels[legacy]=label
        result[kind]={"options":phases,"published_at":entry["published_at"],
                      "phase_labels":labels}
    return result


def player_plans(c,athlete_id):
    plans=_approved(c,athlete_id)
    library=_library(c)
    return {"options_by_color":_colors(plans,library),
            "peri_plans":_peri_plans(plans,library),
            "source":"published_planos"}


def _event_sources(events,matches,overrides,first,last):
    results={}
    for event in events or []:
        if event["kind"] not in PERI_KINDS or not first<=event["event_date"]<=last:
            continue
        results[("event",event["id"])]=dict(event)
    for match in matches or []:
        date=match["match_date"]
        if not first<=date<=last:continue
        session=("morning" if not match.get("match_time") or
                 str(match["match_time"])<"15:00" else "afternoon")
        duplicate=next((e for e in results.values()
                        if e["kind"]=="match" and e["event_date"]==date
                        and e["session"]==session),None)
        synthetic={"id":match["id"],"event_date":date,"kind":"match",
                   "session":session,
                   "pre_override":overrides.get((match["id"],"pre"),"auto"),
                   "post_override":overrides.get((match["id"],"post"),"auto")}
        if duplicate is not None:
            for k in ("pre_override","post_override"):
                values=(duplicate.get(k,"auto"),synthetic.get(k,"auto"))
                duplicate[k]="off" if "off" in values else "on" if "on" in values else "auto"
        else:results[("match",match["id"])]=synthetic
    return list(results.values())


def player_peri_days(c,athlete_id,first,last,events=None,matches=None):
    if events is None:
        import events_v2
        events=events_v2.list_events(c,athlete_id,first,last)
    if matches is None:
        import microcycles_v2
        matches=[m for m in microcycles_v2.list_matches(c,athlete_id)
                 if first<=m["match_date"]<=last]
    overrides={(r["match_id"],r["phase"]):r["state"] for r in c.execute(
        "SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?",
        (athlete_id,)).fetchall()}
    plans=_approved(c,athlete_id)
    library=_library(c)
    result=[]
    for event in _event_sources(events,matches,overrides,first,last):
        kind=event["kind"]
        entry=plans.get(PERI_KINDS[kind])
        if not entry:continue
        for meal in entry["content"].get("meals") or []:
            named=peri_phase(meal.get("name"),kind)
            if not named:continue
            phase,label=PERI_NAMES[named]
            control=("pre_override" if named in
                     ("pre_training","pre_match","intra_match") else "post_override")
            if event.get(control,"auto")=="off":continue
            options=_validated_options(meal,library)
            if not options:continue
            result.append({"event_id":event["id"],"event_date":event["event_date"],
                           "session":event.get("session","morning"),"kind":kind,
                           "phase":phase,"title":label,"options":options})
    return result
