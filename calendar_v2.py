"""Pure, read-only match-day classification helpers for The Mile v2.

Calendar classifications do not modify an athlete's microcycle model.
Combined classifications, rest days and manual overrides are intentionally
left for the later scheduling layer.
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

    Returns a mapping with classification and overlapping candidates. A
    collision is *not* resolved automatically: the nutritionist must decide
    which combined or manual classification applies.
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
    if not candidates:
        return {"date": day, "classification": None, "needs_review": False, "candidates": []}
    if len(candidates) > 1:
        return {"date": day, "classification": None, "needs_review": True, "candidates": candidates}
    return {"date": day, "classification": candidates[0]["classification"],
            "needs_review": False, "candidates": candidates}


def classify_range(start, end, match_dates):
    first, last = parse_day(start), parse_day(end)
    if last < first or (last - first).days > 366:
        raise ValueError("invalid_date_range")
    matches = list(match_dates)
    return [classify_calendar_day((first + timedelta(days=offset)).isoformat(), matches)
            for offset in range((last - first).days + 1)]
