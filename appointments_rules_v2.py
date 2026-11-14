"""Persisted booking rules shared by public calendar, manual bookings and checkout.

Only the admin API can update these rules. Existing holds retain their stored
expires_at when settings change. No Shopify or Google side effects on save.
"""
import time
from appointments_catalog_v2 import ORG_ID

DEFAULT_INTERVAL_MINUTES = 15
DEFAULT_CHECKOUT_HOLD_MINUTES = 15
ALLOWED_START_INTERVALS = (5, 10, 15, 20, 30, 60)
ALLOWED_CHECKOUT_HOLD_MINUTES = (5, 10, 15, 20, 30)


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_booking_rules (
      org_id TEXT PRIMARY KEY,
      start_interval_minutes INTEGER NOT NULL DEFAULT 15
        CHECK (start_interval_minutes IN (5,10,15,20,30,60)),
      checkout_hold_minutes INTEGER NOT NULL DEFAULT 15
        CHECK (checkout_hold_minutes IN (5,10,15,20,30)),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      updated_at BIGINT NOT NULL
    );
    """)


def get(c, org_id=ORG_ID):
    row = c.execute("""SELECT start_interval_minutes, checkout_hold_minutes,
        version, updated_at FROM appt_booking_rules WHERE org_id=?""",
        (org_id,)).fetchone()
    if row is None:
        return {
            "start_interval_minutes": DEFAULT_INTERVAL_MINUTES,
            "checkout_hold_minutes": DEFAULT_CHECKOUT_HOLD_MINUTES,
            "version": 0,
            "updated_at": None,
        }
    return {
        "start_interval_minutes": int(row["start_interval_minutes"]),
        "checkout_hold_minutes": int(row["checkout_hold_minutes"]),
        "version": int(row["version"]),
        "updated_at": int(row["updated_at"]),
    }


def save(c, data, org_id=ORG_ID):
    if not isinstance(data, dict) or set(data) != {
            "start_interval_minutes", "checkout_hold_minutes", "version"}:
        raise ValueError("invalid_booking_rules")
    start, hold, expected = (
        data["start_interval_minutes"], data["checkout_hold_minutes"],
        data["version"])
    if (type(start) is not int or start not in ALLOWED_START_INTERVALS or
            type(hold) is not int or hold not in ALLOWED_CHECKOUT_HOLD_MINUTES or
            type(expected) is not int or expected < 0):
        raise ValueError("invalid_booking_rules")
    current = get(c, org_id)
    if current["version"] != expected:
        raise ValueError("stale_booking_rules")
    now = int(time.time())
    if current["version"] == 0:
        c.execute("""INSERT INTO appt_booking_rules (
          org_id,start_interval_minutes,checkout_hold_minutes,version,updated_at
        ) VALUES (?,?,?,?,?)""", (org_id, start, hold, 1, now))
    else:
        result = c.execute("""UPDATE appt_booking_rules SET
          start_interval_minutes=?, checkout_hold_minutes=?, updated_at=?,
          version=version+1 WHERE org_id=? AND version=?""",
          (start, hold, now, org_id, expected))
        if result.rowcount != 1:
            raise ValueError("stale_booking_rules")
    return get(c, org_id)
