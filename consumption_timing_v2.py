"""Independent, server-validated intra-match consumption by prescribed ingestion timing.

Historical whole-match records remain untouched. Timing rows are only written
where no legacy whole-match row exists; aggregation returns one parent record
to preserve daily energy and macro accounting without double counting.
"""
import json
import math
import time

from consumption_records_v2 import _date, NUTRIENTS
from meal_option_selection_v2 import valid_key

TIMINGS = frozenset((
    "pre_warmup", "warmup", "pre_match", "post_warmup", "first_half",
    "half_time", "second_half", "post_match", "throughout",
))


def initialize(connection):
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS v2_consumption_timing_records (
            athlete_id TEXT NOT NULL,
            meal_date TEXT NOT NULL,
            meal_key TEXT NOT NULL,
            event_id TEXT NOT NULL,
            timing TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('all','partial','none')),
            option_ref TEXT NOT NULL,
            source_draft_id TEXT,
            prescription_json TEXT NOT NULL,
            consumed_foods_json TEXT NOT NULL,
            nutrition_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (athlete_id,meal_date,meal_key,event_id,timing)
        );
        CREATE INDEX IF NOT EXISTS idx_v2_consumption_timing_athlete_date
        ON v2_consumption_timing_records(athlete_id,meal_date);
    """)


def _timing_shares(food, parent):
    splits = food.get("timing_splits") or []
    if splits:
        if not isinstance(splits, list) or len(splits) > len(TIMINGS):
            raise ValueError("invalid_timing_split")
        result = {}
        total = 0.
        for part in splits:
            if not isinstance(part, dict):
                raise ValueError("invalid_timing_split")
            name, share = part.get("timing"), part.get("share")
            if name not in TIMINGS or type(share) not in (int, float) or not math.isfinite(share) or share <= 0:
                raise ValueError("invalid_timing_split")
            total += share
            result[name] = result.get(name, 0.) + share
        if not math.isclose(total, 1., rel_tol=0., abs_tol=0.001):
            raise ValueError("invalid_timing_split")
        return result
    name = food.get("timing") or parent.get("timing")
    return {name: 1.} if name in TIMINGS else {}


def timing_option(option, timing):
    """Build only the published timing's shares, preserving alternative groups.

    The stable option_ref is unchanged; original sources are not mutated.
    """
    if timing not in TIMINGS:
        raise ValueError("invalid_timing")
    foods = option.get("foods") or []
    result, indices = [], {}
    for index, food in enumerate(foods):
        parent_index = food.get("alternative_to")
        if parent_index is not None and (
            type(parent_index) is not int or parent_index >= index or parent_index < 0
        ):
            raise ValueError("invalid_equivalence_group")
        parent = foods[parent_index] if parent_index is not None else {}
        share = _timing_shares(food, parent).get(timing, 0.)
        if share <= 0:
            continue
        piece = dict(food)
        piece.pop("timing_splits", None)
        piece["timing"] = timing
        if piece.get("kind") != "supplement":
            grams = piece.get("grams")
            if type(grams) not in (int, float) or not math.isfinite(grams) or grams <= 0:
                raise ValueError("invalid_timing_quantity")
            piece["grams"] = grams * share
        if parent_index is not None:
            if parent_index not in indices:
                raise ValueError("inconsistent_timing_alternative")
            piece["alternative_to"] = indices[parent_index]
        indices[index] = len(result)
        result.append(piece)
    return {**option, "foods": result} if result else None


def has_legacy(connection, athlete_id, meal_date, event_id):
    row = connection.execute("""
        SELECT 1 FROM v2_consumption_records
        WHERE athlete_id=? AND meal_date=? AND meal_key='intra_match' AND event_id=?
    """, (athlete_id, meal_date, event_id)).fetchone()
    return row is not None


def has_timings(connection, athlete_id, meal_date, event_id):
    row = connection.execute("""
        SELECT 1 FROM v2_consumption_timing_records
        WHERE athlete_id=? AND meal_date=? AND meal_key='intra_match' AND event_id=?
    """, (athlete_id, meal_date, event_id)).fetchone()
    return row is not None


def save_timing(connection, *, athlete_id, meal_date, event_id, timing,
                status, option_ref, source_draft_id, prescription,
                consumed_foods, nutrition):
    valid_key(_date(meal_date), "intra_match", event_id)
    if timing not in TIMINGS or status not in ("all", "partial", "none"):
        raise ValueError("invalid_timing_record")
    if has_legacy(connection, athlete_id, meal_date, event_id):
        raise ValueError("legacy_consumption_exists")
    if not isinstance(nutrition, dict) or any(
        type(nutrition.get(k)) not in (int, float) or
        not math.isfinite(nutrition[k]) or not 0 <= nutrition[k] < 1000000
        for k in NUTRIENTS
    ):
        raise ValueError("invalid_nutrition")
    if status == "none" and (consumed_foods or any(nutrition[k] for k in NUTRIENTS)):
        raise ValueError("nonzero_skipped_meal")
    connection.execute("""
        INSERT INTO v2_consumption_timing_records
        (athlete_id,meal_date,meal_key,event_id,timing,status,option_ref,
         source_draft_id,prescription_json,consumed_foods_json,nutrition_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(athlete_id,meal_date,meal_key,event_id,timing) DO UPDATE SET
            status=excluded.status,option_ref=excluded.option_ref,
            source_draft_id=excluded.source_draft_id,
            prescription_json=excluded.prescription_json,
            consumed_foods_json=excluded.consumed_foods_json,
            nutrition_json=excluded.nutrition_json,updated_at=excluded.updated_at
    """, (
        athlete_id, meal_date, "intra_match", event_id, timing, status, option_ref,
        source_draft_id, json.dumps(prescription, ensure_ascii=False),
        json.dumps(consumed_foods, ensure_ascii=False), json.dumps(nutrition),
        int(time.time()),
    ))
    connection.commit()


def delete_timing(connection, *, athlete_id, meal_date, event_id, timing):
    valid_key(_date(meal_date), "intra_match", event_id)
    if timing not in TIMINGS:
        raise ValueError("invalid_timing")
    cur = connection.execute("""
        DELETE FROM v2_consumption_timing_records
        WHERE athlete_id=? AND meal_date=? AND meal_key='intra_match'
          AND event_id=? AND timing=?
    """, (athlete_id, meal_date, event_id, timing))
    connection.commit()
    return cur.rowcount > 0


def merge_range(connection, athlete_id, start, end, legacy_records):
    """Return exactly one daily-nutrition row per intra-match event.

    Each timing is summed once. A whole-match legacy row is never silently
    replaced or counted alongside timing rows.
    """
    existing = {(r["meal_date"], r["meal_key"], r["event_id"]) for r in legacy_records}
    parents = {}
    rows = connection.execute("""
        SELECT * FROM v2_consumption_timing_records
        WHERE athlete_id=? AND meal_date BETWEEN ? AND ?
        ORDER BY meal_date,meal_key,event_id,timing
    """, (athlete_id, start, end)).fetchall()
    for row in rows:
        key = (row["meal_date"], row["meal_key"], row["event_id"])
        if key in existing:
            continue
        parent = parents.get(key)
        if parent is None:
            parent = {
                "athlete_id": athlete_id, "meal_date": row["meal_date"],
                "meal_key": row["meal_key"], "event_id": row["event_id"],
                "status": "partial", "option_ref": None,
                "source_draft_id": row["source_draft_id"],
                "prescription": {"timing_mode": True},
                "consumed_foods": [], "nutrition": {k: 0. for k in NUTRIENTS},
                "timing_records": [], "updated_at": row["updated_at"],
            }
            parents[key] = parent
        nutrition = json.loads(row["nutrition_json"])
        foods = json.loads(row["consumed_foods_json"])
        parent["timing_records"].append({
            "timing": row["timing"], "status": row["status"],
            "option_ref": row["option_ref"], "nutrition": nutrition,
            "consumed_foods": foods,
        })
        parent["consumed_foods"].extend({**food, "timing": row["timing"]} for food in foods)
        for nutrient in NUTRIENTS:
            parent["nutrition"][nutrient] += float(nutrition[nutrient])
        parent["updated_at"] = max(parent["updated_at"], row["updated_at"])
    return sorted(legacy_records + list(parents.values()),
                  key=lambda r: (r["meal_date"], r["meal_key"], r["event_id"]))
