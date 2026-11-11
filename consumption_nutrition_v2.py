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
    if not ref or not ref.get("active", 1) or food.get("kind") == "supplement":
        raise ValueError("food_unavailable")
    fraction = float(ref.get("edible_fraction", 1)) if ref.get("variant") == "gross" else 1.
    if not math.isfinite(fraction) or not 0 < fraction <= 1:
        raise ValueError("invalid_edible_fraction")
    totals = {}
    for key in KEYS:
        try:
            val = float(ref[key])
        except (KeyError, TypeError, ValueError, OverflowError):
            raise ValueError("invalid_library_nutrition")
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
    if not isinstance(option, dict) or not isinstance(library, dict):
        raise ValueError("invalid_option")
    foods = option.get("foods") or []
    if not isinstance(foods, list):
        raise ValueError("invalid_option")
    edits = [] if edits is None else edits
    additional = [] if additional is None else additional
    if not isinstance(edits, list) or not isinstance(additional, list):
        raise ValueError("invalid_food_selection")
    if status != "partial" and (edits or additional):
        raise ValueError("unexpected_edits")
    if len(foods) > 150 or len(additional) > 100:
        raise ValueError("too_many_foods")
    groups = {}
    for index, food in enumerate(foods):
        parent = food.get("alternative_to")
        if parent is not None:
            if type(parent) is not int or parent < 0 or parent >= index or foods[parent].get("alternative_to") is not None:
                raise ValueError("invalid_equivalence_group")
            groups.setdefault(parent, [parent]).append(index)
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
        for members in groups.values():
            if sum(bool(selected[i]["consumed"]) for i in members) > 1:
                raise ValueError("multiple_equivalents_selected")
    else:
        selected = {}
    totals = {key: 0. for key in KEYS}
    result = []
    if status == "none":
        return {"foods": [], "nutrition": totals}
    # The plan already averages equivalent foods; use that group average
    # as the nutritional reference, scaled by the selected member's grams.
    group_values = {}
    if status != "none":
        for parent, members in groups.items():
            values = []
            for member in members:
                source = foods[member]
                source_grams = _amount(source.get("grams"))
                if not source_grams:
                    raise ValueError("invalid_equivalence_quantity")
                values.append(_nutrition(source, library, source_grams))
            group_values[parent] = {key: sum(v[key] for v in values) / len(values) for key in KEYS}
    for index, food in enumerate(foods):
        if status == "all":
            if food.get("alternative_to") is not None:
                continue
            grams = _amount(food.get("grams"))
        else:
            entry = selected[index]
            grams = _amount(entry.get("grams")) if entry["consumed"] else 0
        if grams == 0 or food.get("kind") == "supplement":
            continue
        parent = food.get("alternative_to")
        group = parent if parent is not None else index
        if group in group_values:
            prescribed_grams = _amount(food.get("grams"))
            value = {key: group_values[group][key] * grams / prescribed_grams for key in KEYS}
        else:
            value = _nutrition(food, library, grams)
        result.append({"id": food["id"], "grams": grams, "additional": False, "option_index": index, "nutrition": value})
        for key in KEYS:
            totals[key] += value[key]
    for entry in additional:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise ValueError("invalid_additional_food")
        grams = _amount(entry.get("grams"))
        if not grams:
            raise ValueError("invalid_additional_quantity")
        food = {"id": entry["id"]}
        value = _nutrition(food, library, grams)
        result.append({"id": food["id"], "grams": grams, "additional": True, "nutrition": value})
        for key in KEYS:
            totals[key] += value[key]
    return {"foods": result, "nutrition": totals}


def active_library(connection):
    """Trusted active catalogue for server-side consumption calculations."""
    return {row["id"]: dict(row) for row in connection.execute(
        "SELECT * FROM v2_food_library WHERE active=1").fetchall()}
