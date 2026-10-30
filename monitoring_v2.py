"""Storage foundation for opt-in player monitoring. No player routes or automation."""
import json
import math
import secrets
import time
from datetime import date, timedelta

SCENARIOS=("very_low","low","medium","high")

def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS v2_daily_weighins (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
      weigh_date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      menstruating INTEGER,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE(athlete_id,weigh_date)
    );
    CREATE INDEX IF NOT EXISTS v2_weighins_lookup ON v2_daily_weighins(athlete_id,weigh_date);
    CREATE TABLE IF NOT EXISTS v2_post_match_responses (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
      match_id TEXT NOT NULL REFERENCES v2_match_events(id),
      minutes INTEGER,
      scenario TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE(athlete_id,match_id)
    );
    CREATE TABLE IF NOT EXISTS v2_monitoring_audit (
      id TEXT PRIMARY KEY,
      athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
      record_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      prior_json TEXT,
      new_json TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS v2_monitoring_audit_lookup
      ON v2_monitoring_audit(athlete_id,record_type,record_id,created_at);
    CREATE TABLE IF NOT EXISTS v2_scenario_cells (
      athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
      classification TEXT NOT NULL,
      scenario TEXT NOT NULL,
      meal TEXT NOT NULL,
      color TEXT,
      PRIMARY KEY(athlete_id,classification,scenario,meal)
    );
    """)

def scenario_for_minutes(minutes):
    if minutes == "not_played":
        return "very_low"
    if isinstance(minutes,bool) or not isinstance(minutes,int) or not 1<=minutes<=130:
        raise ValueError("invalid_minutes")
    if minutes<30:return "low"
    if minutes<60:return "medium"
    return "high"

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
    return None
