"""Per-player, per-day published meal choices. Never modifies the source Planos.

An unpublished draft does not affect players. A published choice is applied only
while the exact option, its order, published plan and effective meal color match.
"""
import hashlib
import json
import re
import time

BASIC = ("breakfast", "lunch", "snack", "dinner", "supper")
PERI = ("pre_training", "post_training", "pre_match", "intra_match", "post_match")
ALL = BASIC + PERI


def option_ref(option):
    """Stable identity of the complete raw option, not its display number."""
    raw = json.dumps(option, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def initialize(c):
    c.executescript("""
        CREATE TABLE IF NOT EXISTS v2_meal_choice_drafts (
            athlete_id TEXT NOT NULL, meal_date TEXT NOT NULL,
            meal_key TEXT NOT NULL, event_id TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL CHECK(action IN ('select','clear')),
            option_index INTEGER, option_ref TEXT, source_draft_id TEXT,
            source_color TEXT, updated_by TEXT NOT NULL, updated_at BIGINT NOT NULL,
            PRIMARY KEY (athlete_id, meal_date, meal_key, event_id)
        );
        CREATE TABLE IF NOT EXISTS v2_meal_choice_publications (
            athlete_id TEXT NOT NULL, meal_date TEXT NOT NULL,
            meal_key TEXT NOT NULL, event_id TEXT NOT NULL DEFAULT '',
            option_index INTEGER NOT NULL, option_ref TEXT NOT NULL,
            source_draft_id TEXT NOT NULL, source_color TEXT,
            published_by TEXT NOT NULL, published_at BIGINT NOT NULL,
            PRIMARY KEY (athlete_id, meal_date, meal_key, event_id)
        );
    """)


def valid_key(meal_date, meal_key, event_id=""):
    if not isinstance(meal_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meal_date):
        raise ValueError("invalid_meal_date")
    from datetime import date
    try: date.fromisoformat(meal_date)
    except ValueError: raise ValueError("invalid_meal_date")
    if meal_key not in ALL or not isinstance(event_id, str) or len(event_id) > 128:
        raise ValueError("invalid_meal_key")
    if (meal_key in BASIC and event_id) or (meal_key in PERI and not event_id):
        raise ValueError("invalid_meal_key")
    return (meal_date, meal_key, event_id)


def enabled(c, athlete_id):
    row = c.execute("SELECT meal_option_selection_enabled FROM v2_athletes WHERE id=? AND archived_at IS NULL", (athlete_id,)).fetchone()
    return bool(row and row["meal_option_selection_enabled"])


def current_source(c, athlete_id, meal_date, meal_key, event_id=""):
    """Resolve effective day colors (including manual overrides) and live Planos."""
    valid_key(meal_date, meal_key, event_id)
    import calendar_v2
    import microcycles_v2
    import events_v2
    import food_plan_calendar_bridge_v2 as bridge
    model = microcycles_v2.get_model(c, athlete_id)
    if not model: return None
    matches = microcycles_v2.list_matches(c, athlete_id)
    days = calendar_v2.effective_days(c, athlete_id, calendar_v2.classify_range(
        meal_date, meal_date, [m["match_date"] for m in matches]))
    colors = calendar_v2.effective_colors(c, athlete_id, days, model)
    events = events_v2.list_events(c, athlete_id, meal_date, meal_date)
    override_rows = c.execute("SELECT match_id,phase,state FROM v2_match_peri_overrides WHERE athlete_id=?", (athlete_id,)).fetchall()
    overrides = {(r["match_id"], r["phase"]): r["state"] for r in override_rows}
    live = bridge.resolve(c, athlete_id, colors, events, matches, overrides)["days"].get(meal_date)
    if not live: return None
    if meal_key in BASIC:
        record = live["meals"].get(meal_key)
    else:
        record = next((x for x in live["peri_events"] if
                       x.get("event_id") == event_id and x.get("phase") == meal_key), None)
    if not record or record.get("status") != "ok":
        return None
    # The player's adapter intentionally refuses the transitional publication
    # state. Only editable choices sourced from explicitly published Planos.
    published = c.execute(
        "SELECT 1 FROM v2_food_plan_editor_publications "
        "WHERE draft_id=? AND athlete_id=? AND state='published'",
        (record.get("draft_id"), athlete_id)).fetchone()
    if not published: return None
    return record


def _stored(c, table, athlete_id, start, end):
    return [dict(row) for row in c.execute(
        "SELECT * FROM " + table + " WHERE athlete_id=? AND meal_date>=? AND meal_date<=? "
        "ORDER BY meal_date,meal_key,event_id", (athlete_id, start, end)).fetchall()]


def read(c, athlete_id, start, end):
    # Admin-only. Do not use as a public player data endpoint.
    from datetime import date
    for value in (start, end):
        if not isinstance(value, str): raise ValueError("invalid_date_range")
        date.fromisoformat(value)
    if start > end: raise ValueError("invalid_date_range")
    return {
        "enabled": enabled(c, athlete_id),
        "drafts": _stored(c, "v2_meal_choice_drafts", athlete_id, start, end),
        "published": _stored(c, "v2_meal_choice_publications", athlete_id, start, end),
    }


def stage(c, athlete_id, meal_date, meal_key, event_id, option_index, actor_id):
    valid_key(meal_date, meal_key, event_id)
    if not enabled(c, athlete_id): raise ValueError("selection_disabled")
    if option_index is not None and (type(option_index) is not int or not 1 <= option_index <= 30):
        raise ValueError("invalid_option_index")
    record = current_source(c, athlete_id, meal_date, meal_key, event_id) if option_index is not None else None
    if option_index is not None and (not record or option_index > len(record["options"])):
        raise ValueError("option_unavailable")
    choice = record["options"][option_index - 1] if record else None
    now = int(time.time())
    c.execute(
        "INSERT INTO v2_meal_choice_drafts"
        "(athlete_id,meal_date,meal_key,event_id,action,option_index,option_ref,source_draft_id,source_color,updated_by,updated_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        " ON CONFLICT (athlete_id,meal_date,meal_key,event_id) DO UPDATE SET"
        " action=excluded.action,option_index=excluded.option_index,"
        " option_ref=excluded.option_ref,source_draft_id=excluded.source_draft_id,"
        " source_color=excluded.source_color,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
        (athlete_id, meal_date, meal_key, event_id,
         "select" if choice else "clear", option_index,
         choice.get("option_ref") if choice else None,
         record.get("draft_id") if record else None,
         record.get("color") if record else None, actor_id, now))
    c.commit()
    return {"saved": True, "published": False, "action": "select" if choice else "clear"}


def publish(c, athlete_id, meal_date, meal_key, event_id, actor_id):
    valid_key(meal_date, meal_key, event_id)
    if not enabled(c, athlete_id): raise ValueError("selection_disabled")
    draft = c.execute(
        "SELECT * FROM v2_meal_choice_drafts WHERE athlete_id=? AND meal_date=? AND meal_key=? AND event_id=?",
        (athlete_id, meal_date, meal_key, event_id)).fetchone()
    if not draft: raise ValueError("no_pending_selection")
    if draft["action"] == "select":
        current = current_source(c, athlete_id, meal_date, meal_key, event_id)
        index = draft["option_index"]
        if not current or not isinstance(index, int) or not 1 <= index <= len(current["options"]):
            raise ValueError("option_stale")
        actual = current["options"][index - 1]
        if (current.get("draft_id") != draft["source_draft_id"] or
                (current.get("color") or None) != (draft["source_color"] or None) or
                actual.get("option_ref") != draft["option_ref"]):
            raise ValueError("option_stale")
        c.execute(
            "INSERT INTO v2_meal_choice_publications"
            "(athlete_id,meal_date,meal_key,event_id,option_index,option_ref,source_draft_id,source_color,published_by,published_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT (athlete_id,meal_date,meal_key,event_id) DO UPDATE SET"
            " option_index=excluded.option_index,option_ref=excluded.option_ref,"
            " source_draft_id=excluded.source_draft_id,source_color=excluded.source_color,"
            " published_by=excluded.published_by,published_at=excluded.published_at",
            (athlete_id, meal_date, meal_key, event_id, index, draft["option_ref"],
             draft["source_draft_id"], draft["source_color"], actor_id, int(time.time())))
    else:
        c.execute("DELETE FROM v2_meal_choice_publications WHERE athlete_id=? AND meal_date=? AND meal_key=? AND event_id=?",
                  (athlete_id, meal_date, meal_key, event_id))
    c.execute("DELETE FROM v2_meal_choice_drafts WHERE athlete_id=? AND meal_date=? AND meal_key=? AND event_id=?",
              (athlete_id, meal_date, meal_key, event_id))
    c.commit()
    return {"published": True, "selection": "set" if draft["action"] == "select" else "cleared"}


def published_for_player(c, athlete_id, start, end):
    """Approved choices only. If the feature is off, return nothing at all."""
    if not enabled(c, athlete_id): return []
    return _stored(c, "v2_meal_choice_publications", athlete_id, start, end)


def visible_options(options, assignment, color=None):
    """Fail-open to existing options if the recorded publication is stale.

    This function never reads drafts. Pass only an approved published record.
    """
    if not assignment: return options
    if (assignment.get("source_color") or None) != (color or None):
        return options
    index = assignment.get("option_index")
    if type(index) is not int or index < 1 or index > len(options):
        return options
    current = options[index - 1]
    if (current.get("option_ref") != assignment.get("option_ref") or
            current.get("source_draft_id") != assignment.get("source_draft_id")):
        return options
    return [current]
