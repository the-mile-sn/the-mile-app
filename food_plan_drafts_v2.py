"""Isolated draft meal-plan editor. No published plan writes."""
import json, secrets, time, unicodedata, hashlib

def initialize(c):
    c.execute("""CREATE TABLE IF NOT EXISTS v2_food_plan_drafts (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
        created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    )""")

PLAN_TYPES = ("Plano laranja", "Plano amarelo", "Plano azul", "Plano verde", "Plano verde preparação", "Plano Peri-jogo", "Plano Peri-treino", "Plano geral")

def validate(value):
    if not isinstance(value,dict): raise ValueError("invalid_plan")
    name=str(value.get("name") or "").strip()
    meals=value.get("meals")
    if not name or len(name)>160 or not isinstance(meals,list) or len(meals)>40: raise ValueError("invalid_plan")
    plan_type=str(value.get("plan_type") or "").strip()
    if plan_type and plan_type not in PLAN_TYPES: raise ValueError("invalid_plan_type")
    player_id=str(value.get("player_id") or "").strip()
    athlete_id=str(value.get("athlete_id") or "").strip()
    player_name=str(value.get("player_name") or "").strip()
    if len(player_id)>100 or len(athlete_id)>100 or len(player_name)>160: raise ValueError("invalid_player")
    origin=str(value.get("origin") or "").strip()
    if origin not in ("", "json_import"): raise ValueError("invalid_origin")
    clean=[]
    for meal in meals:
        if not isinstance(meal,dict) or not isinstance(meal.get("options"),list) or not 1<=len(meal["options"])<=30: raise ValueError("invalid_meal")
        meal_title=str(meal.get("name") or "").strip()
        if not meal_title or len(meal_title)>120: raise ValueError("invalid_meal")
        options=[]
        for option in meal["options"]:
            if not isinstance(option,dict) or not isinstance(option.get("foods"),list) or len(option["foods"])>100: raise ValueError("invalid_option")
            foods=[]
            for food in option["foods"]:
                if not isinstance(food,dict): raise ValueError("invalid_food")
                kind=str(food.get("kind") or "food").strip()
                if kind not in ("food","supplement"): raise ValueError("invalid_food_kind")
                fid=str(food.get("id") or "").strip()
                grams_raw=food.get("grams")
                if grams_raw is None or grams_raw == "":
                    grams=None
                else:
                    try: grams=float(grams_raw)
                    except (TypeError,ValueError): raise ValueError("invalid_quantity")
                    import math
                    if not math.isfinite(grams) or not 0<grams<=100000: raise ValueError("invalid_quantity")
                if kind=="food" and not fid: raise ValueError("invalid_food")
                if kind=="supplement" and fid: raise ValueError("invalid_supplement")
                label=str(food.get("label") or "").strip()
                if len(label)>240 or (kind=="supplement" and not label): raise ValueError("invalid_food_label")
                alternative_to=food.get("alternative_to")
                if alternative_to is not None:
                    if type(alternative_to) is not int or not 0<=alternative_to<len(foods): raise ValueError("invalid_alternative")
                    if foods[alternative_to].get("kind","food")!="food" or kind!="food": raise ValueError("invalid_alternative")
                display_quantity=str(food.get("display_quantity") or "").strip()
                display_name=str(food.get("display_name") or "").strip()
                if len(display_quantity)>100 or len(display_name)>160: raise ValueError("invalid_display_text")
                item={"id":fid,"grams":grams}
                if display_quantity: item["display_quantity"]=display_quantity
                if display_name: item["display_name"]=display_name
                if kind=="supplement": item.update({"kind":"supplement","label":label})
                if alternative_to is not None: item["alternative_to"]=alternative_to
                foods.append(item)
            notes=option.get("notes",[])
            if not isinstance(notes,list) or len(notes)>100: raise ValueError("invalid_notes")
            notes=[str(n).strip() for n in notes]
            if any(len(n)>4000 for n in notes): raise ValueError("invalid_note")
            title=str(option.get("title") or "").strip()
            if len(title)>160: raise ValueError("invalid_option_title")
            order=option.get("order")
            if order is None:
                order=[{"type":"note","index":i} for i in range(len(notes))]+[{"type":"food","index":i} for i in range(len(foods))]
            if not isinstance(order,list) or len(order)!=len(notes)+len(foods): raise ValueError("invalid_order")
            expected={("note",i) for i in range(len(notes))}|{("food",i) for i in range(len(foods))}
            try: actual=[(item["type"],item["index"]) for item in order]
            except (TypeError,KeyError): raise ValueError("invalid_order")
            if any(type(i) is not int for _,i in actual) or len(set(actual))!=len(actual) or set(actual)!=expected: raise ValueError("invalid_order")
            options.append({"title":title,"foods":foods,"notes":notes,"order":order})
        normalized=''.join(ch for ch in unicodedata.normalize('NFD', meal_title.lower()) if unicodedata.category(ch)!='Mn')
        slots=(["Pequeno almoço","Lanche"] if "intermedia" in normalized else
               ["Almoço","Jantar"] if "principal" in normalized else [])
        clean_meal={"name":meal_title,"options":options}
        if slots: clean_meal["applies_to"]=slots
        clean.append(clean_meal)
    return {"id":str(value.get("id") or ""), "name":name,"plan_type":plan_type,"player_id":player_id,"athlete_id":athlete_id,"player_name":player_name,"origin":origin,"meals":clean}

def list_drafts(c):
    rows=c.execute("SELECT id,name,content,created_at,updated_at FROM v2_food_plan_drafts ORDER BY updated_at DESC").fetchall()
    # Identify legacy copies by their deterministic publication-derived ID.
    try:
        legacy_ids={hashlib.sha256(("editor-import-v1:"+str(r["id"])).encode()).hexdigest()[:32]
                    for r in c.execute("SELECT id FROM v2_plan_publications").fetchall()}
    except Exception:
        legacy_ids=set()
    links={r["user_id"]:r["athlete_id"] for r in c.execute(
        "SELECT user_id,athlete_id FROM v2_player_links").fetchall()}
    import food_plan_publications_v2
    result=[]
    for row in rows:
        try: value=json.loads(row["content"])
        except (TypeError,ValueError): value={}
        player_id=str(value.get("player_id") or "").strip()
        athlete_id=str(value.get("athlete_id") or links.get(player_id) or "").strip()
        plan_type=str(value.get("plan_type") or "").strip()
        result.append({"id":row["id"],"name":row["name"],"updated_at":row["updated_at"],"created_at":row["created_at"],"origin":str(value.get("origin") or ""), "legacy_migration":row["id"] in legacy_ids,
                       "player_id":player_id,"athlete_id":athlete_id,"player_name":str(value.get("player_name") or ""),
                       "plan_type":plan_type, "publication":food_plan_publications_v2.state_for_draft(c,row["id"],row["content"])})
    return result

def get(c, ident):
    r=c.execute("SELECT content FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone()
    if not r: return None
    value=json.loads(r["content"])
    value["id"]=ident
    if not value.get("athlete_id") and value.get("player_id"):
        row=c.execute("SELECT athlete_id FROM v2_player_links WHERE user_id=?",
                      (value["player_id"],)).fetchone()
        if row: value["athlete_id"]=row["athlete_id"]
    import food_plan_publications_v2
    value["publication"]=food_plan_publications_v2.state_for_draft(c,ident,r["content"])
    value["updated_at"]=c.execute("SELECT updated_at FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone()["updated_at"]
    return value

def save(c, value):
    value=validate(value)
    ident=str(value.get("id") or secrets.token_hex(16))
    # Never trust client-provided identifiers for food composition.
    known={r["id"] for r in c.execute("SELECT id FROM v2_food_library WHERE active=1").fetchall()}
    if any(f["id"] not in known for m in value["meals"] for o in m["options"] for f in o["foods"] if f.get("kind","food")=="food"): raise ValueError("unknown_food")
    # Athlete profile is canonical; historical player_id stays for old plans.
    athlete_id=value["athlete_id"]
    if not athlete_id and value["player_id"]:
        link=c.execute("""SELECT l.athlete_id FROM v2_player_links l
            JOIN users u ON u.id=l.user_id AND u.role='player'
            JOIN v2_athletes a ON a.id=l.athlete_id AND a.archived_at IS NULL
            WHERE l.user_id=?""",(value["player_id"],)).fetchone()
        if link: athlete_id=link["athlete_id"]
    if not athlete_id or not value["plan_type"]:
        raise ValueError("missing_athlete_or_type")
    athlete=c.execute("SELECT id,name FROM v2_athletes WHERE id=? AND archived_at IS NULL",
                      (athlete_id,)).fetchone()
    if not athlete: raise ValueError("unknown_athlete")
    link=c.execute("""SELECT l.user_id FROM v2_player_links l
        JOIN users u ON u.id=l.user_id AND u.role='player'
        WHERE l.athlete_id=?""",(athlete_id,)).fetchone()
    linked_user=str(link["user_id"]) if link else ""
    if value["player_id"] and value["player_id"]!=linked_user:
        raise ValueError("player_athlete_mismatch")
    value["athlete_id"]=athlete_id
    value["player_id"]=linked_user
    value["player_name"]=athlete["name"]
    value["name"]=value["player_name"]+" - "+value["plan_type"]
    now=int(time.time())
    if c.execute("SELECT id FROM v2_food_plan_drafts WHERE id=?",(ident,)).fetchone():
        c.execute("UPDATE v2_food_plan_drafts SET name=?,content=?,updated_at=? WHERE id=?",(value["name"],json.dumps(value),now,ident))
    else:
        c.execute("INSERT INTO v2_food_plan_drafts(id,name,content,created_at,updated_at) VALUES (?,?,?,?,?)",(ident,value["name"],json.dumps(value),now,now))
    return ident


def delete(c, ident):
    result=c.execute("DELETE FROM v2_food_plan_drafts WHERE id=?",(ident,))
    return result.rowcount > 0


def _meal_key(name):
    clean=unicodedata.normalize("NFD",str(name or "").lower())
    return " ".join("".join(ch if unicodedata.category(ch)!="Mn" else "" for ch in clean).replace("-", " ").split())

def transfer_post_training(c, source_ids, dry_run=True):
    """Safely move identical post-training meals from selected colored drafts to one peri-training draft.
    Never reads or writes publications; caller's DB transaction makes the transfer atomic.
    """
    if not isinstance(source_ids,list) or not 1<=len(source_ids)<=8 or any(not isinstance(x,str) or len(x)>100 for x in source_ids) or len(set(source_ids))!=len(source_ids):
        raise ValueError("invalid_sources")
    colored={"Plano laranja","Plano amarelo","Plano azul","Plano verde","Plano verde preparação"}
    sources=[]
    for ident in source_ids:
        value=get(c,ident)
        if not value or value.get("plan_type") not in colored:
            raise ValueError("invalid_source_plan")
        indexes=[i for i,m in enumerate(value.get("meals") or []) if _meal_key(m.get("name"))=="pos treino"]
        if len(indexes)!=1 or len(value["meals"])<=1:
            raise ValueError("missing_post_training_or_empty_plan")
        sources.append((value,indexes[0]))
    athlete_id=sources[0][0].get("athlete_id")
    player_id=sources[0][0].get("player_id")
    if not athlete_id or any(value.get("athlete_id")!=athlete_id for value,_ in sources):
        raise ValueError("mixed_players")
    meal=sources[0][0]["meals"][sources[0][1]]
    if any(json.dumps(value["meals"][index],sort_keys=True,ensure_ascii=False)!=json.dumps(meal,sort_keys=True,ensure_ascii=False) for value,index in sources):
        raise ValueError("post_training_options_not_identical")
    peri_candidates=[d for d in list_drafts(c) if d.get("athlete_id")==athlete_id and d.get("plan_type")=="Plano Peri-treino"]
    if len(peri_candidates)>1: raise ValueError("ambiguous_peri_training_drafts")
    peri=get(c,peri_candidates[0]["id"]) if peri_candidates else None
    matched=next((m for m in peri["meals"] if _meal_key(m["name"])=="pos treino"),None) if peri else None
    if matched and json.dumps(matched,sort_keys=True,ensure_ascii=False)!=json.dumps(meal,sort_keys=True,ensure_ascii=False):
        raise ValueError("existing_peri_training_conflict")
    result={"athlete_id":athlete_id,"player_id":player_id,"source_ids":source_ids,"source_types":[v["plan_type"] for v,_ in sources],
            "peri_target":peri["id"] if peri else None,"peri_status":("identical" if matched else "append" if peri else "create"),
            "post_training_options":len(meal["options"]),"dry_run":bool(dry_run)}
    if dry_run: return result
    if not peri:
        peri={"name":sources[0][0].get("player_name","Jogador")+" - Plano Peri-treino",
              "player_id":player_id,"athlete_id":athlete_id,"plan_type":"Plano Peri-treino","meals":[meal]}
    elif not matched:
        peri["meals"].append(meal)
    result["peri_target"]=save(c,peri)
    for value,index in sources:
        value["meals"].pop(index)
        save(c,value)
    result["dry_run"]=False
    return result
