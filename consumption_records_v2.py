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
    legacy = [{**dict(row),
               "prescription": json.loads(row["prescription_json"]),
               "consumed_foods": json.loads(row["consumed_foods_json"]),
               "nutrition": json.loads(row["nutrition_json"])}
              for row in rows]
    return _merge_timing_consumption(connection, athlete_id, start, end, legacy)


def _merge_timing_consumption(connection, athlete_id, start, end, legacy):
    """Read-only compatibility with player-app records saved by ingestion moment.

    The admin service is deployed independently and must never create or alter
    player timing tables. Legacy records take precedence, preventing duplicates.
    """
    # Some test/legacy environments have not created the timing table.
    if hasattr(connection, "conn"):  # Production PgConnection adapter
        table = connection.execute(
            "SELECT to_regclass('public.v2_consumption_timing_records') AS table_ref"
        ).fetchone()
        exists = bool(table and table["table_ref"])
    else:
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            ("v2_consumption_timing_records",)
        ).fetchone() is not None
    if not exists:
        return legacy

    rows = connection.execute("""
        SELECT athlete_id,meal_date,meal_key,event_id,timing,status,option_ref,
               source_draft_id,prescription_json,consumed_foods_json,nutrition_json,updated_at
        FROM v2_consumption_timing_records
        WHERE athlete_id=? AND meal_date BETWEEN ? AND ?
        ORDER BY meal_date,meal_key,event_id,timing
    """, (athlete_id, start, end)).fetchall()

    existing = {(r["meal_date"], r["meal_key"], r["event_id"]) for r in legacy}
    groups = {}
    for row in rows:
        key = (row["meal_date"], row["meal_key"], row["event_id"])
        if key in existing:
            continue
        group = groups.get(key)
        if group is None:
            group = {
                "athlete_id": athlete_id, "meal_date": row["meal_date"],
                "meal_key": row["meal_key"], "event_id": row["event_id"],
                "status": "partial", "option_ref": None,
                "source_draft_id": row["source_draft_id"],
                "prescription": {"timing_mode": True},
                "consumed_foods": [],
                "nutrition": {k: 0.0 for k in NUTRIENTS},
                "timing_records": [], "updated_at": row["updated_at"],
            }
            groups[key] = group
        foods = json.loads(row["consumed_foods_json"])
        nutrients = json.loads(row["nutrition_json"])
        timing = {
            "timing": row["timing"], "status": row["status"],
            "option_ref": row["option_ref"], "source_draft_id": row["source_draft_id"],
            "prescription": json.loads(row["prescription_json"]),
            "consumed_foods": foods, "nutrition": nutrients,
            "updated_at": row["updated_at"],
        }
        group["timing_records"].append(timing)
        group["consumed_foods"].extend({**food, "timing": row["timing"]} for food in foods)
        for nutrient in NUTRIENTS:
            group["nutrition"][nutrient] += float(nutrients[nutrient])
        group["updated_at"] = max(group["updated_at"], row["updated_at"])
    return sorted(legacy + list(groups.values()),
                  key=lambda r: (r["meal_date"], r["meal_key"], r["event_id"]))
