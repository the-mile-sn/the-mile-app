"""The Mile checkout hold foundation (phase 6.1).

Admin-only simulation endpoints for now. No storefront/proxy routes, Shopify
checkout, payments, order processing, or Sesami changes are enabled. Holds are
automatically ignored by availability after 15 minutes, even without cron.
Cross-worker transaction locks are shared with manual booking operations.
"""
import re
import secrets
import time
from datetime import datetime, timezone
from appointments_catalog_v2 import ORG_ID
import appointments_assignment_v2 as assignment
import appointments_rules_v2 as rules

HOLD_SECONDS = 15 * 60
ID_RE = re.compile(r"[0-9a-f]{32}\Z")
GID_RE = re.compile(r"gid://shopify/ProductVariant/[0-9]+\Z")


def initialize(c):
    """Additive migration, safe alongside existing manual bookings."""
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_checkout_holds (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('presencial','online')),
      day TEXT NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      start_utc BIGINT NOT NULL,
      end_utc BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'held'
        CHECK(status IN ('held','released','confirmed','payment_review')),
      idempotency_key TEXT NOT NULL,
      shopify_variant_id TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
      shopify_order_id TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CHECK(start_minute < end_minute AND start_utc < end_utc),
      CHECK(expires_at > created_at),
      UNIQUE(org_id,idempotency_key),
      FOREIGN KEY(org_id,professional_id) REFERENCES appt_professionals(org_id,id),
      FOREIGN KEY(org_id,service_id) REFERENCES appt_services(org_id,id)
    );
    CREATE INDEX IF NOT EXISTS appt_checkout_holds_schedule
      ON appt_checkout_holds(org_id,professional_id,day,start_utc,end_utc);
    CREATE INDEX IF NOT EXISTS appt_checkout_holds_expiry
      ON appt_checkout_holds(org_id,status,expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS appt_checkout_holds_orders
      ON appt_checkout_holds(org_id,shopify_order_id)
      WHERE shopify_order_id IS NOT NULL;
    """)


def _epoch(now=None):
    if now is None:
        return int(time.time())
    if not isinstance(now, datetime) or now.tzinfo is None:
        raise ValueError("invalid_now")
    return int(now.astimezone(timezone.utc).timestamp())


def _row(c, identifier, org_id):
    if not isinstance(identifier, str) or not ID_RE.fullmatch(identifier):
        raise LookupError("checkout_hold_not_found")
    row = c.execute(
        "SELECT * FROM appt_checkout_holds WHERE org_id=? AND id=?",
        (org_id, identifier)
    ).fetchone()
    if row is None:
        raise LookupError("checkout_hold_not_found")
    return row


def public_status(row, epoch=None):
    """Return a minimal safe status, never reveal any buyer information."""
    epoch = _epoch() if epoch is None else epoch
    status = row["status"]
    if status == "held" and row["expires_at"] <= epoch:
        status = "expired"
    from appointments_availability_v2 import display_time
    return {
        "id": row["id"],
        "status": status,
        "professional_id": row["professional_id"],
        "service_id": row["service_id"],
        "mode": row["mode"],
        "date": row["day"],
        "start": display_time(row["start_minute"]),
        "end": display_time(row["end_minute"]),
        "expires_at": row["expires_at"],
        "remaining_seconds": (max(0, row["expires_at"] - epoch) if status == "held" else 0),
        "checkout_enabled": False,
        "payment_status": "not_connected",
    }


def active_conflict(c, org_id, professional_id, start_utc, end_utc, now=None):
    """Check active holds and future confirmed checkout bookings under the same lock."""
    epoch = _epoch(now)
    return c.execute("""
        SELECT 1 FROM appt_checkout_holds
        WHERE org_id=? AND professional_id=?
          AND ((status='held' AND expires_at>?) OR status='confirmed')
          AND start_utc<? AND end_utc>?
        LIMIT 1
    """, (org_id, professional_id, epoch, end_utc, start_utc)).fetchone() is not None


def active_by_date(c, org_id, professional_id, start_day, end_day, now=None):
    """Use a single query for a whole month; expired holds never block, confirmed bookings do."""
    epoch = _epoch(now)
    rows = c.execute("""
      SELECT day,start_minute,end_minute FROM appt_checkout_holds
      WHERE org_id=? AND professional_id=? AND day BETWEEN ? AND ?
        AND ((status='held' AND expires_at>?) OR status='confirmed')
      ORDER BY day,start_minute
    """, (org_id, professional_id, start_day, end_day, epoch)).fetchall()
    grouped = {}
    for row in rows:
        grouped.setdefault(row["day"], []).append(row)
    return grouped


def start_hold(c, data, actor, org_id=ORG_ID, now=None):
    """Create or idempotently return one 15-minute hold.

    Callable only through an authenticated backoffice route until app-proxy
    authentication, Storefront cart creation and verified order webhooks exist.
    """
    import appointments_bookings_v2 as bookings
    if not isinstance(data, dict):
        raise ValueError("invalid_request")
    requested_pid = data.get("professional_id")
    if not isinstance(requested_pid, str) or not 0 < len(requested_pid) <= 70:
        raise ValueError("invalid_professional")
    key = data.get("idempotency_key") or secrets.token_hex(16)
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", key):
        raise ValueError("invalid_idempotency_key")
    epoch = _epoch(now)
    now = now or datetime.now(timezone.utc)
    any_mode = requested_pid == assignment.ANY_PROFESSIONAL
    if any_mode:
        # Acquire every eligible professional lock in a stable ID order, so
        # two customers choosing "any" cannot race to claim the same person.
        people = assignment.candidates(
            c, org_id, requested_pid, data.get("service_id"), data.get("mode"),
        )
        ids = [person["id"] for person in people]
    else:
        people = []
        ids = [requested_pid]
    bookings._acquire_transaction_locks(c, org_id, ids)
    previous = c.execute("""
      SELECT * FROM appt_checkout_holds WHERE org_id=? AND idempotency_key=?
    """, (org_id, key)).fetchone()
    if previous is not None:
        if any(previous[field] != data.get(payload) for field, payload in (
            ("service_id", "service_id"), ("mode", "mode"), ("day", "date")
        )):
            raise ValueError("checkout_idempotency_mismatch")
        if (previous["professional_id"] not in ids if any_mode else
                previous["professional_id"] != requested_pid):
            raise ValueError("checkout_idempotency_mismatch")
        from appointments_availability_v2 import clean_time
        if previous["start_minute"] != clean_time(data.get("start")):
            raise ValueError("checkout_idempotency_mismatch")
        if previous["status"] == "held" and previous["expires_at"] > epoch:
            return public_status(previous, epoch)
        raise ValueError("checkout_hold_closed")

    if any_mode:
        # Selection is provisional in the public preview. Real assignment is
        # repeated and persisted only inside this transaction.
        chosen = None
        for candidate in assignment.ranked_professionals(
                c, org_id, people, data.get("date"), now=now):
            try:
                chosen = bookings._validate_candidate(
                    c, org_id, {**data, "professional_id": candidate}, now=now,
                )
                break
            except ValueError as exc:
                if str(exc) not in (
                    "outside_availability", "blocked_period",
                    "booking_overlap", "checkout_hold_conflict",
                    "google_busy", "service_not_available",
                ):
                    raise
        if chosen is None:
            raise ValueError("slot_no_longer_available")
    else:
        chosen = bookings._validate_candidate(c, org_id, data, now=now)
    pid, sid, mode, day, start, end, begin, finish = chosen
    variant = c.execute("""
      SELECT f.shopify_variant_id, f.price_cents FROM appt_service_formats f
      WHERE f.org_id=? AND f.service_id=? AND f.mode=? AND f.enabled=1
    """, (org_id, sid, mode)).fetchone()
    if not variant or not variant["shopify_variant_id"] or not GID_RE.fullmatch(variant["shopify_variant_id"]):
        raise ValueError("checkout_variant_missing")
    identifier = secrets.token_hex(16)
    c.execute("""
      INSERT INTO appt_checkout_holds (
        id,org_id,professional_id,service_id,mode,day,start_minute,end_minute,
        start_utc,end_utc,expires_at,status,idempotency_key,shopify_variant_id,
        price_cents,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'held',?,?,?,?,?)
    """, (identifier,org_id,pid,sid,mode,day,start,end,begin,finish,
          epoch+rules.get(c, org_id)["checkout_hold_minutes"]*60,key,variant["shopify_variant_id"],variant["price_cents"],epoch,epoch))
    return public_status(_row(c, identifier, org_id), epoch)


def release_hold(c, identifier, actor, org_id=ORG_ID, now=None):
    """Admin-only test release. A paid confirmation route is not live."""
    import appointments_bookings_v2 as bookings
    row = _row(c, identifier, org_id)
    bookings._acquire_transaction_locks(c, org_id, [row["professional_id"]])
    row = _row(c, identifier, org_id)
    epoch = _epoch(now)
    if row["status"] == "held":
        c.execute("""
            UPDATE appt_checkout_holds SET status='released',updated_at=?
            WHERE org_id=? AND id=? AND status='held'
        """, (epoch,org_id,identifier))
    return public_status(_row(c,identifier,org_id),epoch)


def summary(c, org_id=ORG_ID, now=None):
    epoch = _epoch(now)
    row = c.execute("""
      SELECT COUNT(*) AS n FROM appt_checkout_holds
      WHERE org_id=? AND status='held' AND expires_at>?
    """, (org_id,epoch)).fetchone()
    return {
        "phase": "checkout_preparation",
        "active_holds": row["n"],
        "hold_minutes": rules.get(c, org_id)["checkout_hold_minutes"],
        "public_booking_enabled": False,
        "shopify_checkout_connected": False,
        "shopify_webhook_connected": False,
        "sesami_connected": False,
        "source_of_truth": "the_mile_internal",
    }
