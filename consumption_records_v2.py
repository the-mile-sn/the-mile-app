"""Isolated persistence for player meal-consumption snapshots.

Phase 1: never changes published plans, microcycles, or weekly averages.
API callers must authenticate the athlete and calculate nutrition server-side
from verified library entries before invoking save_record.
"""
import json
import time
from datetime import date

STATUSES = frozenset(("all", "partial", "none"))
NUTRIENTS = ("kcal", "protein_g", "carbs_g", "fat_g")


def initialize(connection):
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS v2_consumption_records (
            athlete_id TEXT NOT NULL,
            meal_date TEXT NOT NULL,
            meal_key TEXT NOT NULL,
            event_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL CHECK(status IN ('all','partial','none')),
            option_ref TEXT,
            source_draft_id TEXT,
            prescription_json TEXT NOT NULL,
            consumed_foods_json TEXT NOT NULL,
            nutrition_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (athlete_id, meal_date, meal_key, event_id)
        );
        CREATE INDEX IF NOT EXISTS idx_v2_consumption_athlete_date
            ON v2_consumption_records(athlete_id, meal_date);
    """)


def _date(value):
    if not isinstance(value, str):
        raise ValueError("invalid_date")
    if date.fromisoformat(value).isoformat() != value:
        raise ValueError("invalid_date")
    return value


def save_record(connection, *, athlete_id, meal_date, meal_key, event_id="",
                status, option_ref, source_draft_id, prescription,
                consumed_foods, nutrition):
    """Persist a validated server-calculated snapshot, replacing the prior entry.

    This deliberately does not derive or accept any change to the prescribed
    calendar. Authentication and food validation belong to the API boundary.
    """
    from meal_option_selection_v2 import valid_key
    valid_key(_date(meal_date), meal_key, event_id)
    if status not in STATUSES:
        raise ValueError("invalid_status")
    if not isinstance(consumed_foods, list) or not isinstance(prescription, dict):
        raise ValueError("invalid_snapshot")
    if not isinstance(nutrition, dict) or any(
        type(nutrition.get(k)) not in (int, float) or
        not 0 <= nutrition[k] < 1000000 for k in NUTRIENTS
    ):
        raise ValueError("invalid_nutrition")
    if status == "none" and (consumed_foods or any(nutrition[k] != 0 for k in NUTRIENTS)):
        raise ValueError("nonzero_skipped_meal")
    connection.execute("""
        INSERT INTO v2_consumption_records
        (athlete_id,meal_date,meal_key,event_id,status,option_ref,source_draft_id,
         prescription_json,consumed_foods_json,nutrition_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(athlete_id,meal_date,meal_key,event_id) DO UPDATE SET
          status=excluded.status,option_ref=excluded.option_ref,
          source_draft_id=excluded.source_draft_id,
          prescription_json=excluded.prescription_json,
          consumed_foods_json=excluded.consumed_foods_json,
          nutrition_json=excluded.nutrition_json,updated_at=excluded.updated_at
    """, (athlete_id, meal_date, meal_key, event_id, status, option_ref,
          source_draft_id, json.dumps(prescription, ensure_ascii=False),
          json.dumps(consumed_foods, ensure_ascii=False),
          json.dumps(nutrition), int(time.time())))
    connection.commit()


def delete_record(connection, *, athlete_id, meal_date, meal_key, event_id=""):
    """Delete only the authenticated athlete's matching consumption snapshot."""
    from meal_option_selection_v2 import valid_key
    valid_key(_date(meal_date), meal_key, event_id)
    cursor = connection.execute("""
        DELETE FROM v2_consumption_records
        WHERE athlete_id=? AND meal_date=? AND meal_key=? AND event_id=?
    """, (athlete_id, meal_date, meal_key, event_id))
    connection.commit()
    return cursor.rowcount > 0


def read_range(connection, athlete_id, start, end):
    _date(start)
    _date(end)
    if start > end:
        raise ValueError("invalid_range")
    rows = connection.execute("""
        SELECT * FROM v2_consumption_records
        WHERE athlete_id=? AND meal_date BETWEEN ? AND ?
        ORDER BY meal_date,meal_key,event_id
    """, (athlete_id, start, end)).fetchall()
    return [{**dict(row),
             "prescription": json.loads(row["prescription_json"]),
             "consumed_foods": json.loads(row["consumed_foods_json"]),
             "nutrition": json.loads(row["nutrition_json"])}
            for row in rows]
