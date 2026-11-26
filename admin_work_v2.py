"""Private admin-only internal agenda events and team tasks.

Deliberately separate from customer bookings, Google availability, Shopify
payments, player events and clinical records. All timestamps are local calendar
fields in Europe/Lisbon, except audit timestamps (UTC epoch seconds).
"""
from datetime import date
import re
import secrets
import time

EVENT_KINDS = {"meeting", "training", "travel", "other"}
TASK_STATES = {"open", "done"}
MAX_TEXT = 1000


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS tm_internal_events (
      id TEXT PRIMARY KEY,
      event_date TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('meeting','training','travel','other')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      participants TEXT NOT NULL DEFAULT '',
      responsible_id TEXT NOT NULL REFERENCES users(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS tm_events_by_date ON tm_internal_events(event_date,starts_at);
    -- Which consultation agendas an internal event blocks. Each link owns one
    -- appt_manual_blocks row, so every existing availability check (backoffice,
    -- site calendar, checkout) already respects it.
    CREATE TABLE IF NOT EXISTS tm_internal_event_blocks (
      event_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      PRIMARY KEY(event_id, professional_id)
    );
    CREATE TABLE IF NOT EXISTS tm_admin_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      responsible_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')),
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      completed_at BIGINT,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS tm_tasks_due ON tm_admin_tasks(status,due_date);
    """)


def _day(value, field="date", optional=False):
    if optional and (value is None or value == ""):
        return None
    if not isinstance(value, str):
        raise ValueError("invalid_" + field)
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError("invalid_" + field) from None
    if parsed.isoformat() != value:
        raise ValueError("invalid_" + field)
    return value


def _range(first, last):
    a, b = _day(first), _day(last)
    if date.fromisoformat(b) < date.fromisoformat(a) or (
        date.fromisoformat(b) - date.fromisoformat(a)).days > 93:
        raise ValueError("invalid_range")
    return a, b


def _time(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d\d:\d\d", value):
        raise ValueError("invalid_time")
    hours, mins = map(int, value.split(":"))
    if hours > 23 or mins > 59:
        raise ValueError("invalid_time")
    return value


def _text(value, field, required=False, limit=MAX_TEXT):
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise ValueError("invalid_" + field)
    cleaned = value.strip()
    if (required and not cleaned) or len(cleaned) > limit:
        raise ValueError("invalid_" + field)
    return cleaned


def _admin(c, identifier):
    if not isinstance(identifier, str) or not identifier:
        raise ValueError("invalid_responsible")
    row = c.execute(
        "SELECT id FROM users WHERE id=? AND role='admin' AND active=1",
        (identifier,)).fetchone()
    if row is None:
        raise ValueError("invalid_responsible")
    return identifier


def professionals(c):
    rows = c.execute(
        "SELECT id,name FROM users WHERE role='admin' AND active=1 ORDER BY name"
    ).fetchall()
    agenda = c.execute("""SELECT id,name FROM appt_professionals
        WHERE org_id=? AND active=1 ORDER BY name""", (_org(),)).fetchall()
    return {"admins": [dict(row) for row in rows],
            "agenda_professionals": [dict(row) for row in agenda]}


def _org():
    from appointments_catalog_v2 import ORG_ID as org
    return org


def _minutes(value):
    hours, mins = map(int, value.split(":"))
    return hours * 60 + mins


def _block_ids(c, payload):
    raw = payload.get("block_professional_ids")
    if raw is None:
        return None
    if not isinstance(raw, list) or len(raw) > 20:
        raise ValueError("invalid_block_professionals")
    chosen = []
    for item in raw:
        if not isinstance(item, str) or not re.fullmatch(r"[0-9A-Za-z_-]{1,70}", item):
            raise ValueError("invalid_block_professionals")
        if item not in chosen:
            chosen.append(item)
    for item in chosen:
        if c.execute("""SELECT 1 FROM appt_professionals
                WHERE org_id=? AND id=? AND active=1""", (_org(), item)).fetchone() is None:
            raise ValueError("invalid_block_professionals")
    return chosen


def _clear_blocks(c, event_id):
    for row in c.execute("""SELECT block_id FROM tm_internal_event_blocks
            WHERE event_id=?""", (event_id,)).fetchall():
        c.execute("DELETE FROM appt_manual_blocks WHERE org_id=? AND id=?",
                  (_org(), row["block_id"]))
    c.execute("DELETE FROM tm_internal_event_blocks WHERE event_id=?", (event_id,))


def _sync_blocks(c, event_id, professional_ids):
    """Replace this event's agenda blocks; never touches other blocks or bookings."""
    record = c.execute("SELECT * FROM tm_internal_events WHERE id=?", (event_id,)).fetchone()
    _clear_blocks(c, event_id)
    if record is None:
        return
    start, end = _minutes(record["starts_at"]), _minutes(record["ends_at"])
    note = ("Evento interno: " + " ".join(record["title"].split()))[:160]
    now = int(time.time())
    for pid in professional_ids:
        block_id = secrets.token_hex(16)
        c.execute("""INSERT INTO appt_manual_blocks
            (id,org_id,professional_id,day,start_minute,end_minute,note,created_at)
            VALUES(?,?,?,?,?,?,?,?)""",
            (block_id, _org(), pid, record["event_date"], start, end, note, now))
        c.execute("""INSERT INTO tm_internal_event_blocks(event_id,professional_id,block_id)
            VALUES(?,?,?)""", (event_id, pid, block_id))


def _agenda_details(c, record):
    """Who is blocked, plus consultations already booked in that time (warn only)."""
    rows = c.execute("""SELECT b.professional_id,p.name FROM tm_internal_event_blocks b
        JOIN appt_professionals p ON p.id=b.professional_id AND p.org_id=?
        WHERE b.event_id=? AND EXISTS (SELECT 1 FROM appt_manual_blocks m
            WHERE m.org_id=? AND m.id=b.block_id)
        ORDER BY p.name""", (_org(), record["id"], _org())).fetchall()
    record["block_professional_ids"] = [r["professional_id"] for r in rows]
    record["block_professional_names"] = [r["name"] for r in rows]
    start, end = _minutes(record["starts_at"]), _minutes(record["ends_at"])
    conflicts = []
    for r in rows:
        found = c.execute("""SELECT customer_name,start_minute FROM appt_bookings
            WHERE org_id=? AND professional_id=? AND day=? AND status='scheduled'
              AND start_minute<? AND end_minute>?
            UNION ALL
            SELECT c.customer_name,h.start_minute FROM appt_checkout_holds h
            JOIN appt_shopify_confirmations c ON c.org_id=h.org_id AND c.hold_id=h.id
            WHERE h.org_id=? AND h.professional_id=? AND h.day=? AND h.status='confirmed'
              AND h.start_minute<? AND h.end_minute>?""",
            (_org(), r["professional_id"], record["event_date"], end, start,
             _org(), r["professional_id"], record["event_date"], end, start)).fetchall()
        for f in found:
            conflicts.append({"professional": r["name"], "customer": f["customer_name"],
                              "start": "%02d:%02d" % divmod(f["start_minute"], 60)})
    record["agenda_conflicts"] = conflicts
    return record


def _event(c, identifier):
    row = c.execute("""
      SELECT e.*,u.name AS responsible_name
      FROM tm_internal_events e LEFT JOIN users u ON u.id=e.responsible_id
      WHERE e.id=?""", (identifier,)).fetchone()
    if row is None:
        raise LookupError("event_not_found")
    return _agenda_details(c, dict(row))


def _task(c, identifier):
    row = c.execute("""
      SELECT t.*,u.name AS responsible_name
      FROM tm_admin_tasks t LEFT JOIN users u ON u.id=t.responsible_id
      WHERE t.id=?""", (identifier,)).fetchone()
    if row is None:
        raise LookupError("task_not_found")
    return dict(row)


def list_events(c, start, end):
    first, last = _range(start, end)
    rows = c.execute("""
      SELECT e.*,u.name AS responsible_name
      FROM tm_internal_events e LEFT JOIN users u ON u.id=e.responsible_id
      WHERE e.event_date>=? AND e.event_date<=?
      ORDER BY e.event_date,e.starts_at,e.title LIMIT 600""",
      (first, last)).fetchall()
    return {"events": [_agenda_details(c, dict(r)) for r in rows], "truncated": len(rows) == 600}


def _event_data(c, payload, actor):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    kind = payload.get("kind", "meeting")
    if kind not in EVENT_KINDS:
        raise ValueError("invalid_kind")
    event_date = _day(payload.get("date"))
    start, end = _time(payload.get("start")), _time(payload.get("end"))
    if start >= end:
        raise ValueError("invalid_interval")
    return (
        event_date, start, end, kind,
        _text(payload.get("title"), "title", required=True, limit=120),
        _text(payload.get("description", ""), "description"),
        _text(payload.get("participants", ""), "participants", limit=240),
        _admin(c, payload.get("responsible_id") or actor),
    )


def create_event(c, payload, actor):
    data = _event_data(c, payload, actor)
    blocked = _block_ids(c, payload) or []
    identifier, now = secrets.token_hex(16), int(time.time())
    c.execute("""
      INSERT INTO tm_internal_events
      (id,event_date,starts_at,ends_at,kind,title,description,participants,
       responsible_id,created_by,updated_by,created_at,updated_at,version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)""",
      (identifier, *data, actor, actor, now, now))
    _sync_blocks(c, identifier, blocked)
    return _event(c, identifier)


def _version(payload):
    if not isinstance(payload, dict) or type(payload.get("version")) is not int or payload["version"] < 1:
        raise ValueError("invalid_version")
    return payload["version"]


def update_event(c, identifier, payload, actor):
    record = _event(c, identifier)
    if record["version"] != _version(payload):
        raise ValueError("stale_record")
    data = _event_data(c, payload, actor)
    blocked = _block_ids(c, payload)
    if blocked is None:
        blocked = record["block_professional_ids"]
    changed = c.execute("""
      UPDATE tm_internal_events SET
      event_date=?,starts_at=?,ends_at=?,kind=?,title=?,description=?,
      participants=?,responsible_id=?,updated_by=?,updated_at=?,
      version=version+1 WHERE id=? AND version=?""",
      (*data, actor, int(time.time()), identifier, record["version"]))
    if changed.rowcount != 1:
        raise ValueError("stale_record")
    _sync_blocks(c, identifier, blocked)
    return _event(c, identifier)


def delete_event(c, identifier, payload):
    record = _event(c, identifier)
    if record["version"] != _version(payload):
        raise ValueError("stale_record")
    _clear_blocks(c, identifier)
    removed = c.execute("DELETE FROM tm_internal_events WHERE id=? AND version=?",
                        (identifier, record["version"]))
    if removed.rowcount != 1:
        raise ValueError("stale_record")
    return {"ok": True}


def list_tasks(c, status="all", due_before=None):
    if status not in TASK_STATES | {"all"}:
        raise ValueError("invalid_status")
    if due_before:
        due_before = _day(due_before)
    clause = " WHERE 1=1"
    values = []
    if status != "all":
        clause += " AND t.status=?"
        values.append(status)
    if due_before:
        clause += " AND t.due_date IS NOT NULL AND t.due_date<=?"
        values.append(due_before)
    rows = c.execute("""
      SELECT t.*,u.name AS responsible_name
      FROM tm_admin_tasks t LEFT JOIN users u ON u.id=t.responsible_id
    """ + clause + """
      ORDER BY CASE WHEN t.status='open' THEN 0 ELSE 1 END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date, t.updated_at DESC LIMIT 300""", tuple(values)).fetchall()
    return {"tasks": [dict(r) for r in rows], "truncated": len(rows) == 300}


def _task_data(c, payload, actor):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    status = payload.get("status", "open")
    if status not in TASK_STATES:
        raise ValueError("invalid_status")
    return (
        _text(payload.get("title"), "title", required=True, limit=120),
        _text(payload.get("description", ""), "description"),
        _day(payload.get("due_date"), optional=True),
        _admin(c, payload.get("responsible_id") or actor),
        status,
    )


def create_task(c, payload, actor):
    data = _task_data(c, payload, actor)
    now, identifier = int(time.time()), secrets.token_hex(16)
    completed = now if data[-1] == "done" else None
    c.execute("""
      INSERT INTO tm_admin_tasks
      (id,title,description,due_date,responsible_id,status,created_by,
       updated_by,created_at,updated_at,completed_at,version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,1)""",
      (identifier, *data, actor, actor, now, now, completed))
    return _task(c, identifier)


def update_task(c, identifier, payload, actor):
    record = _task(c, identifier)
    if record["version"] != _version(payload):
        raise ValueError("stale_record")
    data = _task_data(c, payload, actor)
    now = int(time.time())
    completed = (record["completed_at"] or now) if data[-1] == "done" else None
    changed = c.execute("""
      UPDATE tm_admin_tasks SET title=?,description=?,due_date=?,
      responsible_id=?,status=?,updated_by=?,updated_at=?,completed_at=?,
      version=version+1 WHERE id=? AND version=?""",
      (*data, actor, now, completed, identifier, record["version"]))
    if changed.rowcount != 1:
        raise ValueError("stale_record")
    return _task(c, identifier)


def delete_task(c, identifier, payload):
    record = _task(c, identifier)
    if record["version"] != _version(payload):
        raise ValueError("stale_record")
    removed = c.execute("DELETE FROM tm_admin_tasks WHERE id=? AND version=?",
                        (identifier, record["version"]))
    if removed.rowcount != 1:
        raise ValueError("stale_record")
    return {"ok": True}
