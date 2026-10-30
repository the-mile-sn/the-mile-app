"""Shared, read-only, as-of weight reference logic for V2. No schema writes."""
import json
import math
from datetime import date, timedelta

def reference_weight(c,athlete_id,on_date):
    """As-of historical reference. Never use a weigh-in from the future."""
    target=date.fromisoformat(on_date)
    start=(target-timedelta(days=6)).isoformat()
    rows=c.execute("""SELECT weigh_date,weight_kg FROM v2_daily_weighins
        WHERE athlete_id=? AND weigh_date BETWEEN ? AND ?
        ORDER BY weigh_date DESC""",(athlete_id,start,on_date)).fetchall()
    if len(rows)>=3:
        return {"weight_kg":round(sum(r["weight_kg"] for r in rows)/len(rows),3),
                "source":"7_day_average","record_count":len(rows),
                "source_date":rows[0]["weigh_date"],"window_start":start,"window_end":on_date}
    if rows:
        return {"weight_kg":rows[0]["weight_kg"],"source":"latest_recent","record_count":len(rows),
                "source_date":rows[0]["weigh_date"]}
    previous=c.execute("""SELECT weigh_date,weight_kg FROM v2_daily_weighins
        WHERE athlete_id=? AND weigh_date<=? ORDER BY weigh_date DESC LIMIT 1""",
        (athlete_id,on_date)).fetchone()
    assessments=c.execute("""SELECT assessed_on,measurements FROM v2_body_assessments
        WHERE athlete_id=? AND assessed_on<=? ORDER BY assessed_on DESC""",
        (athlete_id,on_date)).fetchall()
    for assessment in assessments:
        try:
            value=json.loads(assessment["measurements"]).get("weight")
        except (TypeError,ValueError,AttributeError):
            continue
        if value is not None and isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>0:
            # Outside the recent 7-day weigh-in window, use the newest
            # valid measurement across the two sources, never future data.
            if not previous or assessment["assessed_on"]>previous["weigh_date"]:
                return {"weight_kg":value,"source":"assessment","record_count":1,
                        "source_date":assessment["assessed_on"]}
            break
    if previous:
        return {"weight_kg":previous["weight_kg"],"source":"latest_older",
                "record_count":1,"source_date":previous["weigh_date"]}
    # Final fallback only: initial profile weight, never preferred to a
    # dated weigh-in or assessment. No historical measurement exists.
    profile=c.execute("SELECT weight_kg FROM v2_athletes WHERE id=?",(athlete_id,)).fetchone()
    if profile:
        value=profile["weight_kg"]
        if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>0:
            return {"weight_kg":value,"source":"profile_fallback","record_count":0,
                    "source_date":None}
    return None
