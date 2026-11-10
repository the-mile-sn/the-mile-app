"""Read-only matching between published nutrition plans and approved portion photos.

No mutation of plans, prescriptions, player preferences, or image files.
Only the Backoffice may call this module in the current phase.
"""
import math
import re
import unicodedata

from food_plan_publications_v2 import published_for_athlete
from food_plan_calendar_bridge_v2 import slots

VISIBLE_SLOTS = ("lunch", "dinner")
SLOT_NAMES = {"lunch": "Almoço", "dinner": "Jantar"}
CATEGORIES = ("Arroz", "Arroz com leguminosas", "Massa", "Batata", "Arroz + Batata", "Carne / Peixe")

# Deliberately conservative: a photograph of a cooked portion must never be
# described as a measured representation of a raw/dry or composite product.
_UNCOOKED = re.compile(r"\b(cru|crua|crus|cruas|seco|seca|secos|secas|desidratad[oa]s?|farinha|flocos)\b")
_COMPOSITE = re.compile(r"\b(frango|peru|carne|pescada|atum|salmao|peixe|bacalhau|bife)\b")
_RICE_LEGUMES = re.compile(r"\b(feijao|ervilha|lentilha|grao(?: de bico)?)\b")
_MEAT = re.compile(
    r"^(?:carne\b|bife\b|bifes\b|frango\b|peito de frango\b|peru\b|"
    r"peito de peru\b|vitela\b|vaca\b|novilho\b|porco\b|lombo de porco\b|"
    r"alcatra\b|pescada\b|filete de pescada\b|salmao\b|atum\b|peixe\b|"
    r"bacalhau\b|dourada\b|robalo\b|linguado\b|tilapia\b|corvina\b|"
    r"sardinha\b|carapau\b|lombo de salmao\b|posta de salmao\b|"
    r"filete de peixe\b|filetes de peixe\b)"
)


def normalize(value):
    s = unicodedata.normalize("NFD", str(value or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def classify(name):
    """Return known photo group and a raw/dry warning; never infer by broad food category."""
    n = normalize(name)
    if not n:
        return None, False
    dry = bool(_UNCOOKED.search(n))
    if re.match(r"^arroz\b", n):
        # Arroz de frango, arroz de peixe etc. are complete dishes, not plain rice.
        if _COMPOSITE.search(n):
            return None, dry
        return ("Arroz com leguminosas" if _RICE_LEGUMES.search(n)
                else "Arroz"), dry
    if re.match(r"^(?:massa|esparguete|macarrao|penne|fusilli|farfalle|tagliatelle)\b", n):
        if _COMPOSITE.search(n):
            return None, dry
        return "Massa", dry
    if re.match(r"^batatas?\b", n):
        # The supplied library has no verified sweet-potato or processed-chip equivalents.
        if re.search(r"\b(doce|frita|fritas|chips|palha)\b", n):
            return None, dry
        return "Batata", dry
    if _MEAT.search(n):
        return "Carne / Peixe", dry
    return None, dry


def _number(value):
    try:
        n = float(value)
        if not math.isfinite(n) or not 0 < n <= 10000:
            return None
        return round(n, 2)
    except (ValueError, TypeError):
        return None


def _best_photo(catalogue, category, grams, rice=None, potato=None):
    candidates = catalogue.get(category) or []
    if grams is None or not candidates:
        return None
    def score(photo):
        if rice is not None:
            return (abs(float(photo["rice_g"])-rice) / max(rice, 50)
                    + abs(float(photo["potato_g"])-potato) / max(potato, 50))
        return abs(photo["total_g"] - grams) / max(grams, 50)

    photo = min(candidates, key=lambda p: (score(p), abs(p["total_g"]-grams), p["source_row"]))
    if rice is not None:
        # Both components must remain reasonably close, not just their sum.
        if (abs(photo["rice_g"]-rice)>max(45, rice*0.35)
                or abs(photo["potato_g"]-potato)>max(45, potato*0.35)):
            return None
    elif abs(photo["total_g"]-grams)>max(45, grams*(0.35 if category=="Carne / Peixe" else 0.30)):
        return None
    return photo


def _entry(food, library, catalogue):
    if not isinstance(food, dict) or food.get("kind")=="supplement":
        return None
    ref = library.get(food.get("id")) or {}
    name = str(food.get("display_name") or ref.get("display_name") or "").strip()
    category, dry = classify(name)
    if not category:
        return None
    grams = _number(food.get("grams"))
    result = {"food_name": name, "category": category, "prescribed_g": grams,
              "photo_id": None, "reference_g": None, "match": "unavailable",
              "photo_subject": None, "difference_g": None,
              "preparation_review": not bool(re.search(r"\b(cozid[oa]s?|grelhad[oa]s?|assad[oa]s?|saltead[oa]s?)\b",normalize(name)))}
    if dry or grams is None:
        result["match"] = "raw_or_invalid" if dry else "invalid_quantity"
        return result
    photo = _best_photo(catalogue, category, grams)
    if photo:
        result.update(photo_id=photo["id"], reference_g=photo["total_g"],
                      difference_g=round(photo["total_g"]-grams, 2),
                      match="exact" if abs(photo["total_g"]-grams)<0.01 else "near",
                      photo_subject="Carne branca" if category=="Carne / Peixe" else category)
    return result


def _option_items(option, library, catalogue):
    foods = option.get("foods") or []
    groups = []
    for i, item in enumerate(foods):
        if not isinstance(item, dict) or item.get("alternative_to") is not None:
            continue
        alternatives = [item] + [f for f in foods if isinstance(f, dict)
                         and f.get("alternative_to")==i]
        entries = [_entry(food, library, catalogue) for food in alternatives]
        entries = [entry for entry in entries if entry is not None]
        if entries:
            groups.append({"alternatives": entries})

    # Only construct a combined rice+potato photo from two *independent*
    # foods; never sum alternative ("ou") amounts as if eaten together.
    rice_groups = [g for g in groups if len(g["alternatives"])==1
                   and g["alternatives"][0]["category"]=="Arroz"]
    potato_groups = [g for g in groups if len(g["alternatives"])==1
                     and g["alternatives"][0]["category"]=="Batata"]
    if len(rice_groups)==1 and len(potato_groups)==1:
        rice = rice_groups[0]["alternatives"][0]
        potato = potato_groups[0]["alternatives"][0]
        if rice["match"] not in ("raw_or_invalid","invalid_quantity") and potato["match"] not in ("raw_or_invalid","invalid_quantity"):
            total=round(rice["prescribed_g"]+potato["prescribed_g"], 2)
            photo = _best_photo(catalogue, "Arroz + Batata", total,
                                rice["prescribed_g"], potato["prescribed_g"])
            if photo:
                combined={"food_name":"Arroz + Batata","category":"Arroz + Batata",
                          "prescribed_g":total, "rice_g":rice["prescribed_g"],
                          "potato_g":potato["prescribed_g"], "photo_id":photo["id"],
                          "reference_g":photo["total_g"], "reference_rice_g":photo["rice_g"],
                          "reference_potato_g":photo["potato_g"],
                          "difference_g":round(photo["total_g"]-total,2),
                          "photo_subject":"Arroz + Batata",
                          "match":("exact" if abs(photo["rice_g"]-rice["prescribed_g"])<.01
                                   and abs(photo["potato_g"]-potato["prescribed_g"])<.01 else "near"),
                          "preparation_review":rice["preparation_review"] or potato["preparation_review"]}
                index=min(groups.index(rice_groups[0]),groups.index(potato_groups[0]))
                groups=[g for g in groups if g is not rice_groups[0] and g is not potato_groups[0]]
                groups.insert(index,{"alternatives":[combined]})
    return groups


def preview_for_athlete(c, athlete_id):
    """Live, read-only lookup of the *published* editor snapshot for one athlete."""
    row=c.execute("SELECT id,name FROM v2_athletes WHERE id=? AND archived_at IS NULL",
                  (athlete_id,)).fetchone()
    if not row:
        return None
    plans=published_for_athlete(c, athlete_id)
    library={r["id"]:dict(r) for r in c.execute(
        "SELECT id,display_name,category FROM v2_food_library WHERE active=1").fetchall()}
    catalogue={}
    for r in c.execute(
        "SELECT id,source_row,category,total_g,rice_g,potato_g FROM v2_visual_portions "
        "WHERE active=1 ORDER BY source_row").fetchall():
        p=dict(r)
        catalogue.setdefault(p["category"],[]).append(p)
    summaries=[]
    for plan_type in sorted(plans):
        if plan_type in ("Plano Peri-jogo", "Plano Peri-treino"):
            continue
        for publication in plans[plan_type]:
            if publication.get("publication_state")!="published":
                continue
            meals=[]
            for meal in publication["draft"].get("meals") or []:
                visible=[s for s in slots(meal) if s in VISIBLE_SLOTS]
                if not visible:
                    continue
                options=[]
                for i, option in enumerate((meal.get("options") or [])[:30]):
                    options.append({
                        "option_index":i,"title":str(option.get("title") or "Opção "+str(i+1))[:160],
                        "groups":_option_items(option,library,catalogue)})
                for s in visible:
                    meals.append({"slot":s,"name":SLOT_NAMES[s],
                                  "source_meal":str(meal.get("name") or "")[:120],
                                  "options":options})
            if meals:
                summaries.append({"plan_type":plan_type, "publication_id":publication["id"],
                                  "published_at":publication.get("updated_at"),
                                  "meals":meals})
    return {"athlete_id":athlete_id,"athlete_name":row["name"],"plans":summaries,
            "preview_only":True,"published_to_players":False}
