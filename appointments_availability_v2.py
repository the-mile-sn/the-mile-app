"""The Mile appointment availability, admin-only publishing and internal slot preview.

Availability is published per actual calendar date, not indefinitely recurring.
Local times are Europe/Lisbon wall-clock times; DST edge cases fail closed.
No customer booking, Sesami/Shopify/Google synchronization takes place here.
"""
import re
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from appointments_catalog_v2 import ORG_ID, MODES

LISBON = ZoneInfo("Europe/Lisbon")
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"([01]\d|2[0-3]):([0-5]\d)$")


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_availability_periods (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        day TEXT NOT NULL,
        start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
        end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
        created_at BIGINT NOT NULL,
        CHECK(start_minute < end_minute),
        FOREIGN KEY(org_id, professional_id) REFERENCES appt_professionals(org_id,id)
    );
    CREATE INDEX IF NOT EXISTS appt_availability_dates
        ON appt_availability_periods(org_id,professional_id,day);
    CREATE TABLE IF NOT EXISTS appt_manual_blocks (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        day TEXT NOT NULL,
        start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
        end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
        note TEXT NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        CHECK(start_minute < end_minute),
        FOREIGN KEY(org_id, professional_id) REFERENCES appt_professionals(org_id,id)
    );
    CREATE INDEX IF NOT EXISTS appt_blocks_dates
        ON appt_manual_blocks(org_id,professional_id,day);
    """)


def clean_date(value):
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise ValueError("invalid_date")
    try:
        result = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("invalid_date") from exc
    if result.year < 2020 or result.year > 2100:
        raise ValueError("invalid_date")
    return result


def clean_time(value, allow_end=False):
    if allow_end and value == "24:00":
        return 1440
    if not isinstance(value, str) or not TIME_RE.fullmatch(value):
        raise ValueError("invalid_time")
    hh, mm = value.split(":")
    return int(hh) * 60 + int(mm)


def display_time(minutes):
    return "%02d:%02d" % divmod(minutes, 60)


def _professional(c, org_id, identifier):
    if not isinstance(identifier, str) or not identifier or len(identifier) > 70:
        raise ValueError("invalid_professional")
    row = c.execute("SELECT * FROM appt_professionals WHERE org_id=? AND id=?",
                    (org_id, identifier)).fetchone()
    if row is None:
        raise LookupError("professional_not_found")
    return row


def _period(c, table, org_id, professional, day, start, end, exclude_id=None):
    rows = c.execute(
        "SELECT id,start_minute,end_minute FROM " + table +
        " WHERE org_id=? AND professional_id=? AND day=?",
        (org_id, professional, day)).fetchall()
    for row in rows:
        if row["id"] == exclude_id:
            continue
        if start < row["end_minute"] and row["start_minute"] < end:
            return row
    return None


def _record(row, kind):
    record = {"id": row["id"], "professional_id": row["professional_id"],
              "date": row["day"], "start": display_time(row["start_minute"]),
              "end": display_time(row["end_minute"])}
    if kind == "block":
        record["note"] = row["note"]
    return record


def periods(c, org_id, professional, start_date, end_date):
    _professional(c, org_id, professional)
    start, end = clean_date(start_date), clean_date(end_date)
    if start > end or (end - start).days > 90:
        raise ValueError("invalid_range")
    availability = [_record(row, "availability") for row in c.execute("""
        SELECT * FROM appt_availability_periods
        WHERE org_id=? AND professional_id=? AND day BETWEEN ? AND ?
        ORDER BY day,start_minute""", (org_id, professional, start.isoformat(),
                                         end.isoformat())).fetchall()]
    blocks = [_record(row, "block") for row in c.execute("""
        SELECT * FROM appt_manual_blocks
        WHERE org_id=? AND professional_id=? AND day BETWEEN ? AND ?
        ORDER BY day,start_minute""", (org_id, professional, start.isoformat(),
                                         end.isoformat())).fetchall()]
    return {"availability": availability, "blocks": blocks,
            "timezone": "Europe/Lisbon", "external_calendars_connected": False,
            "booking_integration_active": False}


def save_period(c, kind, payload, org_id=ORG_ID):
    if not isinstance(payload, dict):
        raise ValueError("invalid_request")
    pid = payload.get("professional_id")
    _professional(c, org_id, pid)
    day = clean_date(payload.get("date")).isoformat()
    start = clean_time(payload.get("start"))
    end = clean_time(payload.get("end"), allow_end=True)
    if start >= end:
        raise ValueError("invalid_interval")
    if kind not in ("availability", "block"):
        raise ValueError("invalid_kind")
    if kind == "block":
        raw_note = payload.get("note", "")
        if not isinstance(raw_note, str) or len(raw_note) > 160:
            raise ValueError("invalid_note")
        note = " ".join(raw_note.split())
    else:
        note = ""
    table = "appt_availability_periods" if kind == "availability" else "appt_manual_blocks"
    if _period(c, table, org_id, pid, day, start, end):
        raise ValueError("overlapping_period")
    identifier = secrets.token_hex(16)
    now = int(time.time())
    if kind == "availability":
        c.execute("""INSERT INTO appt_availability_periods
            (id,org_id,professional_id,day,start_minute,end_minute,created_at)
            VALUES(?,?,?,?,?,?,?)""", (identifier, org_id, pid, day, start, end, now))
    else:
        c.execute("""INSERT INTO appt_manual_blocks
            (id,org_id,professional_id,day,start_minute,end_minute,note,created_at)
            VALUES(?,?,?,?,?,?,?,?)""", (identifier, org_id, pid, day, start, end, note, now))
    return identifier


def remove_period(c, kind, identifier, org_id=ORG_ID):
    if not isinstance(identifier, str) or not identifier or len(identifier) > 70:
        raise LookupError("period_not_found")
    table = "appt_availability_periods" if kind == "availability" else "appt_manual_blocks"
    result = c.execute("DELETE FROM " + table + " WHERE id=? AND org_id=?",
                       (identifier, org_id))
    if result.rowcount == 0:
        raise LookupError("period_not_found")


def copy_periods(c, payload, org_id=ORG_ID):
    """Copy one day or seven days of availability. Atomic on conflict."""
    pid = payload.get("professional_id")
    _professional(c, org_id, pid)
    src = clean_date(payload.get("source_date"))
    dst = clean_date(payload.get("target_date"))
    days = payload.get("days")
    if type(days) is not int or days not in (1, 7):
        raise ValueError("invalid_days")
    if src == dst:
        raise ValueError("same_date")
    if days == 7 and (src.weekday() != 0 or dst.weekday() != 0):
        raise ValueError("week_starts_monday")
    src_end = src + timedelta(days=days - 1)
    rows = c.execute("""SELECT day,start_minute,end_minute
        FROM appt_availability_periods
        WHERE org_id=? AND professional_id=? AND day BETWEEN ? AND ?
        ORDER BY day,start_minute""",
                     (org_id, pid, src.isoformat(), src_end.isoformat())).fetchall()
    created, skipped = 0, 0
    for row in rows:
        source_day = date.fromisoformat(row["day"])
        target_day = (dst + (source_day - src)).isoformat()
        start, end = row["start_minute"], row["end_minute"]
        conflict = _period(c, "appt_availability_periods", org_id, pid, target_day, start, end)
        if conflict:
            if conflict["start_minute"] == start and conflict["end_minute"] == end:
                skipped += 1
                continue
            # Transaction rollback is required by caller for atomic copy.
            raise ValueError("overlapping_period")
        c.execute("""INSERT INTO appt_availability_periods
            (id,org_id,professional_id,day,start_minute,end_minute,created_at)
            VALUES(?,?,?,?,?,?,?)""",
                  (secrets.token_hex(16), org_id, pid, target_day,
                   start, end, int(time.time())))
        created += 1
    return {"created": created, "skipped": skipped}


def _valid_lisbon_window(day, start, end):
    """Reject nonexistent/ambiguous local times and DST-crossing windows."""
    midnight = datetime.combine(day, datetime.min.time())
    a = (midnight + timedelta(minutes=start)).replace(tzinfo=LISBON)
    b = (midnight + timedelta(minutes=end)).replace(tzinfo=LISBON)
    for value in (a, b):
        if value.utcoffset() != value.replace(fold=1).utcoffset():
            return None
        instant = value.astimezone(timezone.utc)
        if instant.astimezone(LISBON).replace(tzinfo=None) != value.replace(tzinfo=None):
            return None
    if a.utcoffset() != b.utcoffset():
        return None
    return a, b


def preview(c, org_id, professional, service, mode, day_value, now=None):
    """Internal approximation only. Never offer these slots as public bookable."""
    p = _professional(c, org_id, professional)
    day = clean_date(day_value)
    if mode not in MODES:
        raise ValueError("invalid_mode")
    s = c.execute("""SELECT id,duration_minutes,active FROM appt_services
        WHERE org_id=? AND id=?""", (org_id, service)).fetchone()
    if s is None:
        raise LookupError("service_not_found")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("invalid_now")
    today = now.astimezone(LISBON).date()
    if day < today or day > today + timedelta(days=60):
        return {"date": day.isoformat(), "slots": [], "reason": "outside_booking_window",
                "preview_only": True, "includes_google": False, "includes_bookings": False}
    enabled = c.execute("""SELECT f.enabled FROM appt_professional_services x
        JOIN appt_service_formats f ON f.org_id=x.org_id AND f.service_id=x.service_id AND f.mode=?
        WHERE x.org_id=? AND x.professional_id=? AND x.service_id=?""",
                        (mode, org_id, professional, service)).fetchone()
    if (not p["active"] or not s["active"] or not enabled or not enabled["enabled"] or
            not p[mode + "_enabled"]):
        return {"date": day.isoformat(), "slots": [], "reason": "service_not_available",
                "preview_only": True, "includes_google": False, "includes_bookings": False}
    available = c.execute("""SELECT start_minute,end_minute FROM appt_availability_periods
        WHERE org_id=? AND professional_id=? AND day=? ORDER BY start_minute""",
                          (org_id, professional, day.isoformat())).fetchall()
    blocked = c.execute("""SELECT start_minute,end_minute FROM appt_manual_blocks
        WHERE org_id=? AND professional_id=? AND day=?""",
                        (org_id, professional, day.isoformat())).fetchall()
    duration = s["duration_minutes"]
    slots = []
    for window in available:
        start_min = ((window["start_minute"] + 14) // 15) * 15
        for start in range(start_min, window["end_minute"] - duration + 1, 15):
            end = start + duration
            if any(start < row["end_minute"] and row["start_minute"] < end for row in blocked):
                continue
            valid = _valid_lisbon_window(day, start, end)
            if valid is None or valid[0].astimezone(timezone.utc) <= now:
                continue
            slots.append({"start": display_time(start), "end": display_time(end)})
    return {"date": day.isoformat(), "slots": slots,
            "preview_only": True, "includes_google": False,
            "includes_bookings": False, "timezone": "Europe/Lisbon",
            "interval_minutes": 15, "buffer_minutes": 0}
