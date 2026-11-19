"""Resolve currently published player meals, including event-specific peri meals.

Read-only adapter: derive the same approved Planos snapshot as the player's
calendar. Do not mutate drafts, prescriptions, or event assignments.
"""
import food_plan_player_v2 as plans
import meal_option_selection_v2 as choices

def _published_peri_source(c, athlete_id, meal_date, meal_key, event_id):
    """Return a verified raw food snapshot for one visible, published peri event.

    The calendar's published player_peri_days adapter is the visibility gate:
    it accounts for event ownership, date, phase, and peri overrides.
    """
    visible = [item for item in plans.player_peri_days(c, athlete_id, meal_date, meal_date)
               if item.get("event_id") == event_id
               and item.get("event_date") == meal_date
               and item.get("selection_phase") == meal_key]
    if len(visible) != 1:
        return None  # Missing, overridden off, or ambiguous event phase.
    event = visible[0]
    kind = event.get("kind")
    plan_type = plans.PERI_KINDS.get(kind)
    if not plan_type:
        return None
    published = plans._approved(c, athlete_id).get(plan_type)
    if not published:
        return None
    candidates = [meal for meal in published["content"].get("meals") or []
                  if plans.peri_phase(meal.get("name"), kind) == meal_key]
    if len(candidates) != 1:
        return None
    library = plans._library(c)
    rendered_options = event.get("options") or []
    raw_options = candidates[0].get("options") or []
    if not raw_options or len(raw_options) != len(rendered_options):
        return None
    options = []
    for raw, rendered in zip(raw_options, rendered_options):
        if (rendered.get("option_ref") != choices.option_ref(raw)
                or rendered.get("source_draft_id") != published["draft_id"]):
            return None  # Stale or mismatched published content.
        try:
            plans._option_totals(raw, library)
            plans._option_items(raw, library)
        except (ValueError, TypeError, KeyError, OverflowError, ZeroDivisionError):
            return None
        foods = []
        for food in raw.get("foods") or []:
            display = dict(food)
            if food.get("kind") != "supplement":
                ref = library.get(food.get("id")) or {}
                display["display_name"] = (ref.get("display_name")
                                           or food.get("display_name")
                                           or food.get("name") or "Alimento")
            foods.append(display)
        options.append({"option_ref":choices.option_ref(raw),
                        "title":raw.get("title") or "Opção " + str(len(options) + 1),
                        "foods":foods})
    return {"options":options,"draft_id":published["draft_id"],
            "color":None,"planned_color":None}


def current_source(c, athlete_id, meal_date, meal_key, event_id="", consumed_color=None):
    choices.valid_key(meal_date, meal_key, event_id)
    if meal_key in choices.PERI:
        if consumed_color is not None:  # No plan color switching for peri events.
            raise ValueError("invalid_consumed_color")
        return _published_peri_source(c, athlete_id, meal_date, meal_key, event_id)
    if meal_key not in choices.BASIC:
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
    """Only ordinary plan-color meals can be logged against another color."""
    if meal_key in choices.PERI:
        choices.valid_key(meal_date, meal_key, event_id)
        return []
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
