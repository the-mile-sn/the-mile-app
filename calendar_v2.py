"""Pure, read-only match-day classification helpers for The Mile v2.

Calendar classifications do not modify an athlete's microcycle model.
Known combined classifications and explicit recovery/preparation priorities
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
        elif days_after == 1:
            # Recovery always wins over MD-6 (normal seven-day gap).
            classification = "MD+1"
        elif days_before is not None and 1 <= days_before <= 6:
            # Preparation wins over MD+2 (e.g. MD-5 in a normal week).
            classification = f"MD-{days_before}"
        elif days_after is not None and 1 <= days_after <= 2:
            classification = f"MD+{days_after}"
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
