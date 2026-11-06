"""Read-only resolution of current editor meal-plan drafts for microcycles."""
import json

COLOR_TYPES = {'orange': 'Plano laranja', 'yellow': 'Plano amarelo', 'blue': 'Plano azul', 'green': 'Plano verde', 'vp': 'Plano verde preparação'}


def available_drafts(c, athlete_id):
    athlete = c.execute("SELECT id FROM v2_athletes WHERE id=? AND archived_at IS NULL", (athlete_id,)).fetchone()
    if not athlete:
        return {}
    link = c.execute('SELECT user_id FROM v2_player_links WHERE athlete_id=?', (athlete_id,)).fetchone()
    user_id = str(link["user_id"]) if link else ""
    results = {}
    for row in c.execute('SELECT id, content, updated_at FROM v2_food_plan_drafts').fetchall():
        try:
            draft = json.loads(row['content'])
        except (ValueError, TypeError):
            continue
        draft_athlete = str(draft.get("athlete_id") or "")
        draft_user = str(draft.get("player_id") or "")
        # A stored athlete ID wins over a matching account ID.
        if draft_athlete:
            if draft_athlete != str(athlete_id):
                continue
            if draft_user and draft_user != user_id:
                continue
        elif not user_id or draft_user != user_id:
            continue
        results.setdefault(draft.get('plan_type'), []).append({'id': row['id'], 'draft': draft, 'updated_at': row['updated_at']})
    return results


import math
import unicodedata

FIELDS = ("kcal", "protein_g", "carbs_g", "fat_g")
MEAL_NAMES = {"breakfast":"pequeno almoco", "lunch":"almoco", "snack":"lanche", "dinner":"jantar", "supper":"ceia"}


def normalize(value):
    s = unicodedata.normalize("NFD", str(value or "").lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").replace("-", " ").split())


def slots(meal):
    name = normalize(meal.get("name"))
    if name == "intermedia" or ("pequeno almoco" in name and "lanche" in name):
        return ("breakfast", "snack")
    if name == "principal" or ("almoco" in name and "jantar" in name):
        return ("lunch", "dinner")
    names = [name] + [normalize(x) for x in (meal.get("applies_to") or [])]
    return tuple(k for k, label in MEAL_NAMES.items() if label in names)


def zero():
    return {k:0.0 for k in FIELDS}


def food_values(food, library):
    if food.get("kind") == "supplement":
        return zero(), False
    ref = library.get(food.get("id"))
    amount = food.get("grams")
    if ref is None or amount is None:
        return zero(), True
    try:
        grams = float(amount)
        fraction = float(ref["edible_fraction"]) if ref["variant"] == "gross" else 1.0
        if not math.isfinite(grams) or grams <= 0 or not 0 < fraction <= 1:
            return zero(), True
        return {k: float(ref[k]) * grams * fraction / 100 for k in FIELDS}, False
    except (ValueError, TypeError, KeyError):
        return zero(), True


def option_values(option, library):
    foods = option.get("foods") or []
    totals, provisional = zero(), False
    for index, primary in enumerate(foods):
        if primary.get("alternative_to") is not None:
            continue
        group = [primary] + [f for f in foods if f.get("alternative_to") == index]
        chosen = [f for f in group if f.get("grams") is not None]
        provisional |= len(chosen) != len(group)
        if not chosen:
            chosen = [primary]
        nutrition = [food_values(f, library) for f in chosen]
        provisional |= any(pending for _, pending in nutrition)
        for key in FIELDS:
            totals[key] += sum(v[key] for v, _ in nutrition) / len(nutrition)
    return totals, provisional


def resolve(c, athlete_id, colors_by_day):
    """Admin-only dynamic preview; no edits or publication changes."""
    from microcycles_v2 import MEALS
    drafts = available_drafts(c, athlete_id)
    rows = c.execute("SELECT id,display_name,variant,edible_fraction,kcal,protein_g,carbs_g,fat_g FROM v2_food_library WHERE active=1").fetchall()
    library = {r["id"]:dict(r) for r in rows}
    days = {}
    for day, colors in colors_by_day.items():
        meals = {}
        total = zero()
        issues = []
        for slot in MEALS:
            color_info = colors.get(slot) or {}
            color = color_info.get("color") if isinstance(color_info, dict) else color_info
            if not color or color == "none":
                meals[slot] = {"status":"no_color", "color":color}
                continue
            plan_type = COLOR_TYPES.get(color)
            choices = drafts.get(plan_type, [])
            status = None
            if not plan_type:
                status = "unsupported_color"
            elif not choices:
                status = "missing_plan"
            elif len(choices) != 1:
                status = "ambiguous_plan"
            if status:
                meals[slot] = {"status":status, "color":color}
                issues.append({"meal":slot, "color":color, "status":status})
                continue
            entry = choices[0]
            matching = [m for m in entry["draft"].get("meals", []) if slot in slots(m)]
            if len(matching) != 1:
                status = "missing_meal" if not matching else "ambiguous_meal"
                meals[slot] = {"status":status, "color":color}
                issues.append({"meal":slot, "color":color, "status":status})
                continue
            meal = matching[0]
            options = meal.get("options") or []
            if not options:
                meals[slot] = {"status":"missing_options", "color":color}
                issues.append({"meal":slot, "color":color, "status":"missing_options"})
                continue
            values = [option_values(o, library) for o in options]
            average = {k:sum(v[k] for v,_ in values)/len(values) for k in FIELDS}
            provisional = any(p for _,p in values)
            for key in FIELDS:
                total[key] += average[key]
            status = "provisional" if provisional else "ok"
            previews = []
            for option, (nutrition, option_pending) in zip(options, values):
                foods = []
                for food in option.get("foods") or []:
                    ref = library.get(food.get("id")) or {}
                    foods.append({**food, "library_name":ref.get("display_name", "")})
                previews.append({
                    "title":option.get("title") or "",
                    "foods":foods,
                    "notes":option.get("notes") or [],
                    "order":option.get("order") or [],
                    "nutrition":nutrition,
                    "provisional":option_pending,
                })
            meals[slot] = {"status":status,"color":color,"draft_id":entry["id"],
                           "source_meal_name":meal.get("name"),
                           "options":previews,"nutrition":average,
                           "updated_at":entry["updated_at"]}
            if provisional:
                issues.append({"meal":slot,"color":color,"status":status})
        days[day] = {"meals":meals,"nutrition":total,
                     "state":"partial" if issues else "complete",
                     "issues":issues,
                     "peri_included":False}
    return {"source":"live_editor_drafts","days":days,
            "available_plan_types":sorted(x for x in drafts if isinstance(x,str))}
