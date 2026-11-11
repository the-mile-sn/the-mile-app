"""Server-side calculation of confirmed food consumption (phase 1).

No reads or writes to microcycle or weekly-average tables.
Call with an authenticated athlete's verified published option and a trusted
food-library mapping. Never accept nutrition totals from the client.
"""
import math

KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")


def _amount(value):
    if isinstance(value, bool):
        raise ValueError("invalid_quantity")
    try:
        amount = float(value)
    except (TypeError, ValueError, OverflowError):
        raise ValueError("invalid_quantity")
    if not math.isfinite(amount) or amount < 0 or amount > 100000:
        raise ValueError("invalid_quantity")
    return amount


def _nutrition(food, library, grams):
    ref = library.get(food.get("id"))
    if not ref or food.get("kind") == "supplement":
        raise ValueError("food_unavailable")
    fraction = float(ref.get("edible_fraction", 1)) if ref.get("variant") == "gross" else 1.
    if not math.isfinite(fraction) or not 0 < fraction <= 1:
        raise ValueError("invalid_edible_fraction")
    totals = {}
    for key in KEYS:
        val = float(ref[key])
        if not math.isfinite(val) or val < 0:
            raise ValueError("invalid_library_nutrition")
        totals[key] = val * grams * fraction / 100
    return totals


def calculate(option, library, status, edits=None, additional=None):
    """Return validated foods and totals; option is a published-plan snapshot.

    edits: list of {index, consumed, grams} for each prescribed food.
    additional: list of {id, grams} referring to existing library entries.
    Alternative foods are not silently counted together: the client must
    explicitly select which alternatives were consumed in partial mode.
    """
    if status not in ("all", "partial", "none"):
        raise ValueError("invalid_status")
    foods = option.get("foods") or []
    if not isinstance(foods, list):
        raise ValueError("invalid_option")
    edits = edits or []
    additional = additional or []
    if status != "partial" and (edits or additional):
        raise ValueError("unexpected_edits")
    if len(foods) > 150 or len(additional) > 100:
        raise ValueError("too_many_foods")
    if status == "partial":
        if len(edits) != len(foods):
            raise ValueError("incomplete_food_selection")
        selected = {}
        for entry in edits:
            if not isinstance(entry, dict) or type(entry.get("index")) is not int:
                raise ValueError("invalid_food_selection")
            index = entry["index"]
            if index < 0 or index >= len(foods) or index in selected or type(entry.get("consumed")) is not bool:
                raise ValueError("invalid_food_selection")
            selected[index] = entry
    else:
        selected = {}
    totals = {key: 0. for key in KEYS}
    result = []
    if status == "none":
        return {"foods": [], "nutrition": totals}
    for index, food in enumerate(foods):
        if status == "all":
            if food.get("alternative_to") is not None:
                continue
            grams = _amount(food.get("grams"))
        else:
            entry = selected[index]
            grams = _amount(entry.get("grams")) if entry["consumed"] else 0
        if grams == 0:
            continue
        value = _nutrition(food, library, grams)
        result.append({"id": food["id"], "grams": grams, "additional": False, "nutrition": value})
        for key in KEYS:
            totals[key] += value[key]
    for entry in additional:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise ValueError("invalid_additional_food")
        grams = _amount(entry.get("grams"))
        if not grams:
            continue
        food = {"id": entry["id"]}
        value = _nutrition(food, library, grams)
        result.append({"id": food["id"], "grams": grams, "additional": True, "nutrition": value})
        for key in KEYS:
            totals[key] += value[key]
    return {"foods": result, "nutrition": totals}
