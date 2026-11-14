"""Resolve a player's current published basic meal from production's Planos adapter.

No draft or prescription mutations. Peri-event meals are not enabled in this
pilot until their event-specific source has an equivalent verified adapter.
"""
import food_plan_player_v2 as plans
import meal_option_selection_v2 as choices

def current_source(c, athlete_id, meal_date, meal_key, event_id="", consumed_color=None):
    choices.valid_key(meal_date, meal_key, event_id)
    if event_id or meal_key not in choices.BASIC:
        return None
    import calendar_v2
    import microcycles_v2
    model=microcycles_v2.get_model(c,athlete_id)
    if not model:
        return None
    matches=microcycles_v2.list_matches(c,athlete_id)
    days=calendar_v2.effective_days(c,athlete_id,calendar_v2.classify_range(
        meal_date,meal_date,[m["match_date"] for m in matches]))
    colors=calendar_v2.effective_colors(c,athlete_id,days,model)
    entry=colors.get(meal_date,{}).get(meal_key) or {}
    color=entry.get("color")
    if consumed_color is not None and (not isinstance(consumed_color, str) or consumed_color not in plans.COLORS):
        raise ValueError("invalid_consumed_color")
    selected_color = consumed_color if consumed_color is not None else color
    plan_type=plans.COLORS.get(selected_color)
    if not plan_type or not plans.COLORS.get(color):
        return None
    published=plans._approved(c,athlete_id).get(plan_type)
    if not published:
        return None
    library=plans._library(c)
    candidates=[meal for meal in published["content"].get("meals") or []
                if meal_key in plans.meal_slots(meal)]
    if len(candidates)!=1:
        return None
    options=[]
    for index,option in enumerate(candidates[0].get("options") or [],1):
        try:
            plans._option_totals(option,library)
            plans._option_items(option,library)
        except (ValueError,TypeError,KeyError,OverflowError,ZeroDivisionError):
            return None
        # Add display labels only to the API response; keep the original
        # published option immutable and its stable option_ref unchanged.
        foods=[]
        for food in option.get("foods") or []:
            display=dict(food)
            if food.get("kind") != "supplement":
                ref=library.get(food.get("id")) or {}
                display["display_name"]=ref.get("display_name") or food.get("name") or "Alimento"
            foods.append(display)
        options.append({"option_ref":choices.option_ref(option),
                        "title":option.get("title") or "Opção "+str(index),
                        "foods":foods})
    if not options:
        return None
    return {"options":options,"draft_id":published["draft_id"],
            "color":selected_color,"planned_color":color}


def available_alternative_colors(c, athlete_id, meal_date, meal_key, event_id=""):
    """Only return other colors with valid published options for this meal."""
    planned = current_source(c, athlete_id, meal_date, meal_key, event_id)
    if not planned:
        return []
    result = []
    for color in plans.COLORS:
        if color == planned["planned_color"]:
            continue
        source = current_source(c, athlete_id, meal_date, meal_key, event_id, consumed_color=color)
        if source and source["options"]:
            result.append(color)
    return result
