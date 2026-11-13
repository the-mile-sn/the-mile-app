"""The Mile: internal manual appointments (stage 4.1).

This is NOT a Shopify, Sesami, or Google Calendar connector. An internal
appointment only reserves time inside this database. Never mark it paid.
All writes use transaction locks to protect against concurrent double-booking.
"""
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from appointments_catalog_v2 import ORG_ID, MODES
import appointments_availability_v2 as availability
import appointments_google_v2 as google


def initialize(c):
    """Additive, repeatable migration; no existing appointment data is touched."""
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_bookings (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('presencial','online')),
        day TEXT NOT NULL,
        start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
        end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
        start_utc BIGINT NOT NULL,
        end_utc BIGINT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL DEFAULT '',
        customer_phone TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'scheduled'
            CHECK(status IN ('scheduled','cancelled')),
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source='manual'),
        payment_status TEXT NOT NULL DEFAULT 'not_linked'
            CHECK(payment_status='not_linked'),
        shopify_order_id TEXT,
        google_event_id TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        updated_by TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        CHECK(start_minute < end_minute AND start_utc < end_utc),
        CHECK(version > 0),
        FOREIGN KEY(org_id, professional_id)
            REFERENCES appt_professionals(org_id, id),
        FOREIGN KEY(org_id, service_id)
            REFERENCES appt_services(org_id, id)
    );
    CREATE INDEX IF NOT EXISTS appt_bookings_by_date
        ON appt_bookings(org_id,day,start_minute);
    CREATE INDEX IF NOT EXISTS appt_bookings_by_professional
        ON appt_bookings(org_id,professional_id,start_utc,end_utc);
    CREATE UNIQUE INDEX IF NOT EXISTS appt_bookings_unique_active_start
        ON appt_bookings(org_id,professional_id,start_utc)
        WHERE status='scheduled';

    CREATE TABLE IF NOT EXISTS appt_booking_history (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        booking_id TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL CHECK(action IN ('created','rescheduled','cancelled')),
        previous_day TEXT,
        previous_start TEXT,
        current_day TEXT,
        current_start TEXT,
        created_at BIGINT NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES appt_bookings(id)
    );
    CREATE INDEX IF NOT EXISTS appt_booking_history_by_booking
        ON appt_booking_history(org_id,booking_id,created_at);
    """)


def _small_text(value, field, minimum=0, maximum=140):
    if value is None and minimum == 0:
        return ""
    if not isinstance(value, str):
        raise ValueError("invalid_" + field)
    cleaned = " ".join(value.strip().split())
    if not minimum <= len(cleaned) <= maximum:
        raise ValueError("invalid_" + field)
    return cleaned


def _customer(payload):
    name = _small_text(payload.get("customer_name"), "customer_name", 2, 140)
    email = _small_text(payload.get("customer_email"), "customer_email", 0, 254).lower()
    phone = _small_text(payload.get("customer_phone"), "customer_phone", 0, 45)
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("invalid_customer_email")
    return name, email, phone


def _acquire_transaction_locks(c, org_id, professional_ids):
    """Serialize writes per professional, even from simultaneous API workers."""
    ids = sorted(set(professional_ids))
    if hasattr(c, "conn"):
        # PostgreSQL READ COMMITTED sees the previous writer's commit after
        # waiting for this transaction-scoped advisory lock.
        for identifier in ids:
            c.execute("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
                      (org_id + ":" + identifier,))
    elif not c.in_transaction:
        # SQLite tests and local environments serialize before checking overlap.
        c.execute("BEGIN IMMEDIATE")


def _get(c, org_id, identifier):
    if not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{32}", identifier):
        raise LookupError("booking_not_found")
    row = c.execute("SELECT * FROM appt_bookings WHERE org_id=? AND id=?",
                    (org_id, identifier)).fetchone()
    if row is None:
        raise LookupError("booking_not_found")
    return row


def _validate_candidate(c, org_id, payload, exclude=None, now=None):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    pid, sid, mode = payload.get("professional_id"), payload.get("service_id"), payload.get("mode")
    if not isinstance(pid, str) or len(pid) > 70 or not pid:
        raise ValueError("invalid_professional")
    if not isinstance(sid, str) or len(sid) > 70 or not sid:
        raise ValueError("invalid_service")
    if mode not in MODES:
        raise ValueError("invalid_mode")
    p = availability._professional(c, org_id, pid)
    s = c.execute("SELECT * FROM appt_services WHERE org_id=? AND id=?", (org_id, sid)).fetchone()
    if s is None:
        raise LookupError("service_not_found")
    association = c.execute("""
        SELECT f.enabled FROM appt_professional_services ps
        JOIN appt_service_formats f ON f.org_id=ps.org_id
            AND f.service_id=ps.service_id AND f.mode=?
        WHERE ps.org_id=? AND ps.professional_id=? AND ps.service_id=?
    """, (mode, org_id, pid, sid)).fetchone()
    if not (p["active"] and p[mode+"_enabled"] and s["active"] and
            association and association["enabled"]):
        raise ValueError("service_not_available")
    day = availability.clean_date(payload.get("date"))
    start = availability.clean_time(payload.get("start"))
    if start % 15:
        raise ValueError("start_not_on_quarter")
    end = start + int(s["duration_minutes"])
    if end > 1440:
        raise ValueError("invalid_interval")
    window = availability._valid_lisbon_window(day, start, end)
    if window is None:
        raise ValueError("invalid_dst_window")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("invalid_now")
    local_today = now.astimezone(availability.LISBON).date()
    if day < local_today or day > local_today + timedelta(days=60):
        raise ValueError("outside_booking_window")
    start_utc = int(window[0].astimezone(timezone.utc).timestamp())
    end_utc = int(window[1].astimezone(timezone.utc).timestamp())
    if start_utc <= now.timestamp():
        raise ValueError("start_must_be_future")
    periods = c.execute("""
        SELECT start_minute,end_minute FROM appt_availability_periods
        WHERE org_id=? AND professional_id=? AND day=?
    """, (org_id, pid, day.isoformat())).fetchall()
    if not any(x["start_minute"] <= start and end <= x["end_minute"] for x in periods):
        raise ValueError("outside_availability")
    blocks = c.execute("""
        SELECT 1 FROM appt_manual_blocks
        WHERE org_id=? AND professional_id=? AND day=?
            AND start_minute<? AND end_minute>? LIMIT 1
    """, (org_id, pid, day.isoformat(), end, start)).fetchone()
    if blocks:
        raise ValueError("blocked_period")
    conflict = c.execute("""
        SELECT id FROM appt_bookings
        WHERE org_id=? AND professional_id=? AND status='scheduled'
          AND start_utc<? AND end_utc>? AND id<>? LIMIT 1
    """, (org_id, pid, end_utc, start_utc, exclude or "")).fetchone()
    if conflict:
        raise ValueError("booking_overlap")
    # Read real Google free/busy under the same local booking lock. If the
    # provider cannot be reached, reject instead of accidentally double-booking.
    busy = google.busy_intervals(
        c, org_id, pid, window[0].astimezone(timezone.utc),
        window[1].astimezone(timezone.utc))
    if any(start_utc < int(stop.timestamp()) and int(begin.timestamp()) < end_utc
           for begin, stop in busy):
        raise ValueError("google_busy")
    return (pid, sid, mode, day.isoformat(), start, end, start_utc, end_utc)


def _audit(c, org_id, booking_id, actor, action, prev=None, current=None):
    c.execute("""INSERT INTO appt_booking_history
        (id,org_id,booking_id,actor_id,action,previous_day,previous_start,
         current_day,current_start,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)""", (
        secrets.token_hex(16), org_id, booking_id, actor, action,
        prev["day"] if prev else None,
        availability.display_time(prev["start_minute"]) if prev else None,
        current["day"] if current else None,
        availability.display_time(current["start_minute"]) if current else None,
        int(time.time())))


def create(c, payload, actor, org_id=ORG_ID, now=None):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    name, email, phone = _customer(payload)
    pid = payload.get("professional_id")
    if not isinstance(pid, str) or not pid or len(pid)>70:
        raise ValueError("invalid_professional")
    _acquire_transaction_locks(c, org_id, [pid])
    v = _validate_candidate(c, org_id, payload, now=now)
    identifier = secrets.token_hex(16)
    timestamp = int(time.time())
    c.execute("""INSERT INTO appt_bookings
        (id,org_id,professional_id,service_id,mode,day,start_minute,end_minute,
        start_utc,end_utc,customer_name,customer_email,customer_phone,status,source,
        payment_status,version,created_by,updated_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'scheduled','manual','not_linked',1,?,?,?,?)""",
        (identifier, org_id, *v, name, email, phone, actor, actor, timestamp, timestamp))
    row = _get(c, org_id, identifier)
    _audit(c, org_id, identifier, actor, "created", current=row)
    return identifier


def reschedule(c, identifier, payload, actor, org_id=ORG_ID, now=None):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    current = _get(c, org_id, identifier)
    pid = payload.get("professional_id")
    if not isinstance(pid, str) or not pid or len(pid)>70:
        raise ValueError("invalid_professional")
    _acquire_transaction_locks(c, org_id, [current["professional_id"], pid])
    current = _get(c, org_id, identifier)
    version = payload.get("version")
    if type(version) is not int or version != current["version"]:
        raise ValueError("stale_booking")
    if current["status"] != "scheduled":
        raise ValueError("booking_cancelled")
    name, email, phone = _customer(payload)
    v = _validate_candidate(c, org_id, payload, exclude=identifier, now=now)
    updated = int(time.time())
    result = c.execute("""UPDATE appt_bookings SET
        professional_id=?,service_id=?,mode=?,day=?,start_minute=?,end_minute=?,
        start_utc=?,end_utc=?,customer_name=?,customer_email=?,customer_phone=?,
        version=version+1,updated_by=?,updated_at=?
        WHERE id=? AND org_id=? AND version=? AND status='scheduled'""",
        (*v, name, email, phone, actor, updated, identifier, org_id, version))
    if result.rowcount != 1:
        raise ValueError("stale_booking")
    new = _get(c, org_id, identifier)
    _audit(c, org_id, identifier, actor, "rescheduled", current, new)
    return identifier


def cancel(c, identifier, expected_version, actor, org_id=ORG_ID):
    current = _get(c, org_id, identifier)
    _acquire_transaction_locks(c, org_id, [current["professional_id"]])
    current = _get(c, org_id, identifier)
    if type(expected_version) is not int or expected_version != current["version"]:
        raise ValueError("stale_booking")
    if current["status"] == "cancelled":
        raise ValueError("booking_cancelled")
    now = int(time.time())
    result = c.execute("""UPDATE appt_bookings
        SET status='cancelled',version=version+1,updated_by=?,updated_at=?
        WHERE org_id=? AND id=? AND version=? AND status='scheduled'""",
        (actor, now, org_id, identifier, expected_version))
    if result.rowcount != 1:
        raise ValueError("stale_booking")
    _audit(c, org_id, identifier, actor, "cancelled", prev=current)


def _public_booking(row):
    return {
        "id": row["id"],
        "professional_id": row["professional_id"],
        "service_id": row["service_id"],
        "professional_name": row["professional_name"],
        "service_name": row["service_name"],
        "mode": row["mode"],
        "date": row["day"],
        "start": availability.display_time(row["start_minute"]),
        "end": availability.display_time(row["end_minute"]),
        "customer_name": row["customer_name"],
        "customer_email": row["customer_email"],
        "customer_phone": row["customer_phone"],
        "status": row["status"],
        "source": "manual",
        "payment_status": "not_linked",
        "shopify_order_id": None,
        "google_event_id": None,
        "version": row["version"],
    }


def list_bookings(c, from_day, to_day, professional_id="", service_id="", status="all",
                  org_id=ORG_ID):
    first, last = availability.clean_date(from_day), availability.clean_date(to_day)
    if first > last or (last-first).days > 92:
        raise ValueError("invalid_range")
    if status not in ("all", "scheduled", "cancelled"):
        raise ValueError("invalid_status")
    for value in (professional_id, service_id):
        if not isinstance(value, str) or len(value)>70:
            raise ValueError("invalid_filter")
    sql = """SELECT b.*,p.name AS professional_name,s.name AS service_name
        FROM appt_bookings b
        JOIN appt_professionals p ON p.id=b.professional_id AND p.org_id=b.org_id
        JOIN appt_services s ON s.id=b.service_id AND s.org_id=b.org_id
        WHERE b.org_id=? AND b.day BETWEEN ? AND ?"""
    params = [org_id, first.isoformat(), last.isoformat()]
    if professional_id:
        sql += " AND b.professional_id=?"
        params.append(professional_id)
    if service_id:
        sql += " AND b.service_id=?"
        params.append(service_id)
    if status!="all":
        sql += " AND b.status=?"
        params.append(status)
    sql += " ORDER BY b.day,b.start_minute,b.id LIMIT 301"
    rows = c.execute(sql, tuple(params)).fetchall()
    return {
        "bookings": [_public_booking(row) for row in rows[:300]],
        "truncated": len(rows)>300,
        "timezone": "Europe/Lisbon",
        "internal_only": True,
        "integrations": {"sesami": False, "google": False, "shopify": False}
    }
