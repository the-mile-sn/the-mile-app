"""Pure, read-only meal color resolution for post-match scenarios.

NOT connected to live APIs or player views. Caller supplies already authorized
athlete data. No database writes, no side effects.
"""
from datetime import date

ELIGIBLE=("MD+1","MD+2","MD+1/-3","MD+2/-2","MD+1/-2","MD+2/-1")
MEALS=("breakfast","lunch","snack","dinner","supper")
SCENARIOS=("very_low","low","medium","high")


def resolve_day(day, classification, baseline, overrides, scenario_cells,
                matches, responses, today):
    """Return {meal: {color, source, match_id, scenario}} for one date.

    The response must be linked to the preceding match ID, and cannot affect
    dates before the response was submitted. Only the first two dates after
    that match can be influenced. Existing explicit meal overrides always win.

    today is the date of the as-of query; once applied, an automatic choice\n    remains visible in historical views rather than disappearing tomorrow.\n    A later submission never changes days preceding its submission date.
    Submission date is a calendar date provided by the caller; timestamps
    must be normalized to the appropriate agreed timezone before invocation.
    """
    target=date.fromisoformat(day)
    current=date.fromisoformat(today)
    match_index={m["id"]:date.fromisoformat(m["match_date"]) for m in matches}
    eligible_response=None
    if classification in ELIGIBLE:
        candidates=[]
        for record in responses:
            match_day=match_index.get(record.get("match_id"))
            if match_day is None or (target-match_day).days not in (1,2):
                continue
            submitted=record.get("submitted_date")
            if not submitted:
                continue
            submitted_day=date.fromisoformat(submitted)
            if submitted_day>target or submitted_day>current:
                continue
            scenario=record.get("scenario")
            if scenario not in SCENARIOS:
                continue
            candidates.append((match_day,record))
        if candidates:
            eligible_response=max(candidates,key=lambda item:item[0])[1]
    resolved={}
    for meal in MEALS:
        base=baseline.get(meal)
        color=base
        source="base"
        scenario=None
        match_id=None
        if eligible_response is not None:
            scenario=eligible_response["scenario"]
            match_id=eligible_response["match_id"]
            if scenario!="high":
                setting=scenario_cells.get((classification,scenario,meal))
                if setting is not None:
                    color=setting
                    source="scenario"
        key=(day,meal)
        if key in overrides:
            color=overrides[key]
            source="manual"
        resolved[meal]={"color":None if color=="none" else color,
                        "source":source,"scenario":scenario,"match_id":match_id}
    return resolved
