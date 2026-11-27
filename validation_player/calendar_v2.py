"""Pure, read-only match-day classification helpers for The Mile v2.

Calendar classifications do not modify an athlete's microcycle model.
Known combined classifications and recovery-first priorities
are applied automatically; rest days and manual overrides remain separate.
"""
from datetime import date, timedelta


def parse_day(value):
    if not isinstance(value, str):
        raise ValueError("invalid_date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("invalid_date") from exc
    if parsed.isoformat() != value:
        raise ValueError("invalid_date")
    return parsed


def classify_calendar_day(day, match_dates):
    """Classify a day relative to scheduled matches.

    Returns a mapping with classification and overlapping candidates.
    Routine overlaps are automatically resolved without changing prescriptions.
    """
    target = parse_day(day)
    matches = sorted({parse_day(item) for item in match_dates})
    candidates = []
    for match in matches:
        delta = (target - match).days
        if delta == 0:
            name = "MD"
        elif -6 <= delta <= -1:
            name = f"MD{delta}"
        elif 1 <= delta <= 2:
            name = f"MD+{delta}"
        else:
            continue
        candidates.append({"match_date": match.isoformat(), "classification": name})
    # Match days always remain MD, even within another match's MD-6 window.
    if any(item["classification"] == "MD" for item in candidates):
        classification = "MD"
    else:
        previous = max((match for match in matches if match < target), default=None)
        upcoming = min((match for match in matches if match > target), default=None)
        days_after = (target - previous).days if previous else None
        days_before = (upcoming - target).days if upcoming else None

        # Combined labels already configured in the athlete's microcycle matrix.
        combinations = {"MD+1/-2", "MD+2/-1", "MD+1/-3", "MD+2/-2"}
        combined = (f"MD+{days_after}/-{days_before}"
                    if days_after is not None and days_before is not None else None)
        if combined in combinations:
            classification = combined
        elif days_after is not None and 1 <= days_after <= 2:
            # Outside the configured combined types, both recovery days win
            # over preparation (MD-6/-5/-4/-3 can overlap with MD+2).
            classification = f"MD+{days_after}"
        elif days_before is not None and 1 <= days_before <= 6:
            classification = f"MD-{days_before}"
        else:
            classification = None
    return {"date": day, "classification": classification,
            "needs_review": False, "candidates": candidates}


def classify_range(start, end, match_dates):
    first, last = parse_day(start), parse_day(end)
    if last < first or (last - first).days > 366:
        raise ValueError("invalid_date_range")
    matches = list(match_dates)
    return [classify_calendar_day((first + timedelta(days=offset)).isoformat(), matches)
            for offset in range((last - first).days + 1)]


def initialize(c):
    """Persist optional, date-scoped classification choices; the model is unchanged."""
    c.execute("""CREATE TABLE IF NOT EXISTS v2_day_classification_overrides (
        athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
        day_date TEXT NOT NULL,
        classification TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (athlete_id, day_date)
    )""")
    c.execute("CREATE INDEX IF NOT EXISTS v2_day_classification_lookup "
              "ON v2_day_classification_overrides(athlete_id,day_date)")


def effective_days(c, athlete_id, days):
    """Resolve nutritional classifications without changing MD chronology."""
    if not days:
        return []
    first, last = days[0]["date"], days[-1]["date"]
    off_dates = {r["event_date"] for r in c.execute(
        "SELECT event_date FROM v2_calendar_events WHERE athlete_id=? "
        "AND kind='off' AND event_date>=? AND event_date<=?",
        (athlete_id, first, last)).fetchall()}
    overrides = {r["day_date"]: r["classification"] for r in c.execute(
        "SELECT day_date,classification FROM v2_day_classification_overrides "
        "WHERE athlete_id=? AND day_date>=? AND day_date<=?",
        (athlete_id, first, last)).fetchall()}
    result = []
    for day in days:
        automatic = day["classification"]
        has_off_event = day["date"] in off_dates
        off_applies = has_off_event and automatic != "MD"
        default = automatic
        if off_applies:
            if automatic and automatic.startswith("MD+1"):
                default = "Off (+1)"
            elif automatic and automatic.startswith("MD+2"):
                default = "Off (+2)"
            else:
                default = "Off"
        manual = overrides.get(day["date"])
        effective = manual if manual is not None else default
        result.append({**day, "temporal_classification": automatic,
                       "automatic_classification": default,
                       "classification": effective,
                       "classification_override": manual,
                       "classification_source": "manual" if manual is not None else "automatic",
                       "is_off": effective in ("Off", "Off (+1)", "Off (+2)"),
                       "off_conflict": has_off_event and automatic == "MD"})
    return result


def effective_colors(c, athlete_id, days, model_data=None):
    """Canonical meal colors for the calendar, menus and player app."""
    from microcycles_v2 import get_model, MEALS
    if not days:
        return {}
    if model_data is None:
        model_data = get_model(c, athlete_id)
    rows = {r["name"]: r["meals"] for r in model_data["classifications"]}
    manual = {(r["meal_date"], r["meal"]): r["color"] for r in c.execute(
        "SELECT meal_date,meal,color FROM v2_day_meal_colors WHERE athlete_id=? "
        "AND meal_date>=? AND meal_date<=?",
        (athlete_id,days[0]["date"],days[-1]["date"])).fetchall()}
    result = {}
    for day in days:
        day_key = day["date"]
        baseline = rows.get(day["classification"] or "Geral", {})
        per_meal = {}
        for meal in MEALS:
            key = (day_key, meal)
            color = manual[key] if key in manual else baseline.get(meal)
            per_meal[meal] = {"color": None if color == "none" else color,
                              "source": "manual" if key in manual else "model"}
        result[day_key] = per_meal
    return result
