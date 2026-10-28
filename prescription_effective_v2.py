"""Pure, read-only meal color resolution for post-match scenarios.

NOT connected to live APIs or player views. Caller supplies already authorized
athlete data. No database writes, no side effects.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
import json

ELIGIBLE=("MD+1","MD+2","MD+1/-3","MD+2/-2","MD+1/-2","MD+2/-1")
MEALS=("breakfast","lunch","snack","dinner","supper")
SCENARIOS=("very_low","low","medium","high")


def resolve_day(day, classification, baseline, overrides, scenario_cells,
                matches, responses, today):
    """Resolve a day without writing prescriptions or changing past days.

    Each response can contain revisions [{effective_date, scenario}].
    For a historical day, use only the revision known at that date.
    A response without revisions uses its original submitted_date.
    Dates are local calendar dates provided by the caller.
    """
    target=date.fromisoformat(day)
    current=date.fromisoformat(today)
    match_index={m["id"]:date.fromisoformat(m["match_date"]) for m in matches}
    eligible_response=None
    eligible_scenario=None
    if classification in ELIGIBLE:
        # Only the most recent game before this day can control recovery.
        previous=[(match_date,match_id) for match_id,match_date in match_index.items()
                  if match_date<target]
        previous_match=max(previous,default=None)
        if previous_match and (target-previous_match[0]).days in (1,2):
            match_id=previous_match[1]
            records=[r for r in responses if r.get("match_id")==match_id]
            if records:
                record=records[-1]
                revisions=record.get("revisions")
                if revisions is None:
                    revisions=[{"effective_date":record.get("submitted_date"),
                                "scenario":record.get("scenario")}]
                valid=[]
                for revision in revisions:
                    effective=revision.get("effective_date")
                    scenario=revision.get("scenario")
                    if not effective or scenario not in SCENARIOS:
                        continue
                    effective_day=date.fromisoformat(effective)
                    if effective_day<=target and effective_day<=current:
                        valid.append((effective_day,scenario))
                if valid:
                    eligible_response=record
                    eligible_scenario=max(valid,key=lambda item:item[0])[1]
    resolved={}
    for meal in MEALS:
        color=baseline.get(meal)
        source="base"
        if eligible_response is not None and eligible_scenario!="high":
            setting=scenario_cells.get((classification,eligible_scenario,meal))
            if setting is not None:
                color=setting
                source="scenario"
        if (day,meal) in overrides:
            color=overrides[(day,meal)]
            source="manual"
        resolved[meal]={"color":None if color=="none" else color,
                        "source":source,
                        "scenario":eligible_scenario,
                        "match_id":eligible_response["match_id"] if eligible_response else None}
    return resolved


def revisions_from_audit(response, audit_rows, tz_name="Europe/Lisbon"):
    """Build dated scenario revisions for one active response using its audit log.

    Caller must supply records scoped to the same authorized athlete. A deleted
    response is never passed here. UTC timestamps become local calendar dates.
    Old records without a matching audit entry fall back to initial creation.
    Does not mutate its inputs or query the database.
    """
    zone=ZoneInfo(tz_name)
    events=[]
    for row in audit_rows:
        if row.get("record_type")!="post_match" or row.get("record_id")!=response.get("id"):
            continue
        try:
            payload=row.get("new_json")
            if isinstance(payload,str):payload=json.loads(payload)
            if not isinstance(payload,dict) or payload.get("deleted"):continue
            if payload.get("match_id")!=response.get("match_id"):continue
            scenario=payload.get("scenario")
            if scenario not in SCENARIOS:continue
            stamp=int(row["created_at"])
            day=datetime.fromtimestamp(stamp,timezone.utc).astimezone(zone).date().isoformat()
            events.append((stamp,str(row.get("id","")),day,scenario))
        except (ValueError,TypeError,OverflowError):
            continue
    events.sort()
    if not events:
        stamp=response.get("created_at")
        if stamp is None or response.get("scenario") not in SCENARIOS:return []
        day=datetime.fromtimestamp(int(stamp),timezone.utc).astimezone(zone).date().isoformat()
        return [{"effective_date":day,"scenario":response["scenario"]}]
    return [{"effective_date":day,"scenario":scenario} for _,_,day,scenario in events]
