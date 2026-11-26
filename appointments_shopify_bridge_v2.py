"""The Mile Shopify payment bridge — guarded until the custom Shopify app is installed.

Use app-specific client secret (NOT the ChatGPT Shopify connector credential).
The default is deliberately OFF. No public checkout can be enabled without
an authenticated app proxy, verified webhook, and either an explicit Sesami
migration flag or a separately acknowledged manual-calendar launch mode.
The manual mode does not read existing Google Calendar-only commitments.

Only orders/paid webhooks may confirm a The Mile appointment. An expired hold,
invalid marker, modified variant/quantity/price, or conflict is recorded for
manual review; no late payment may silently displace another booking.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs

from appointments_catalog_v2 import ORG_ID

SHOP_DEFAULT = "the-mile-sports-nutrition.myshopify.com"
PROXY_PATH_DEFAULT = "/apps/the-mile-booking"
HEX_ID = re.compile(r"[0-9a-f]{32}\Z")
VARIANT_GID_RE = re.compile(r"gid://shopify/ProductVariant/[1-9][0-9]*\Z")
DELIVERY_ID = re.compile(r"[a-zA-Z0-9_-]{8,100}\Z")
ORDER_ID = re.compile(r"[1-9][0-9]{0,19}\Z")
MAX_WEBHOOK = 500_000


class ShopifyBridgeError(ValueError):
    pass


def _secret():
    secret = os.environ.get("MILE_SHOPIFY_APP_SECRET", "")
    if not isinstance(secret, str) or len(secret) < 32:
        return None
    return secret.encode("utf-8")


def _shop():
    return os.environ.get("MILE_SHOPIFY_SHOP_DOMAIN", SHOP_DEFAULT).strip().lower()


def _flag(name):
    return os.environ.get(name, "0").strip() == "1"


def webhook_enabled():
    return _flag("MILE_SHOPIFY_WEBHOOK_ENABLED") and _secret() is not None and _shop() == SHOP_DEFAULT


def manual_calendar_mode_enabled():
    """Explicit temporary launch mode: backoffice availability/blocks only.

    Does NOT claim Sesami bookings were migrated or Google is connected.
    Existing Google-only events must be blocked manually in the backoffice.
    """
    return _flag("MILE_SHOPIFY_MANUAL_CALENDAR_MODE")


def checkout_enabled():
    return (webhook_enabled() and _flag("MILE_SHOPIFY_CHECKOUT_ENABLED")
            and (_flag("MILE_SHOPIFY_SESAMI_MIGRATED")
                 or manual_calendar_mode_enabled()))


def initialize(c):
    c.executescript("""
    CREATE TABLE IF NOT EXISTS appt_shopify_webhook_deliveries (
      org_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      delivery_id TEXT NOT NULL,
      order_id TEXT,
      result TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (org_id, shop_domain, delivery_id)
    );
    CREATE TABLE IF NOT EXISTS appt_shopify_payment_reviews (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      hold_id TEXT,
      reason TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appt_shopify_reviews_unique
      ON appt_shopify_payment_reviews(org_id,order_id,coalesce(hold_id,''),reason);
    CREATE INDEX IF NOT EXISTS appt_shopify_reviews_order
      ON appt_shopify_payment_reviews(org_id,order_id);
    CREATE TABLE IF NOT EXISTS appt_shopify_confirmations (
      hold_id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      shopify_order_id TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      created_at BIGINT NOT NULL,
      UNIQUE(org_id,shopify_order_id),
      FOREIGN KEY(hold_id) REFERENCES appt_checkout_holds(id)
    );
    CREATE TABLE IF NOT EXISTS appt_shopify_booking_changes (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      hold_id TEXT NOT NULL,
      shopify_order_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL CHECK(action IN ('rescheduled','released')),
      reason TEXT NOT NULL,
      actor_id TEXT,
      previous_professional_id TEXT,
      previous_day TEXT,
      previous_start_minute INTEGER,
      current_professional_id TEXT,
      current_day TEXT,
      current_start_minute INTEGER,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appt_shopify_booking_changes_hold
      ON appt_shopify_booking_changes(org_id,hold_id,created_at);
    """)


def verify_proxy(query_string, now=None):
    """Authorize customer hold writes only after checkout is explicitly enabled."""
    if not checkout_enabled():
        raise ShopifyBridgeError("shopify_checkout_disabled")
    return verify_proxy_signature(query_string, now=now)


def verify_proxy_signature(query_string, now=None):
    """Read-only Shopify app proxy signature verification, independent of checkout.

    Allows testing the storefront proxy without enabling purchases or writing
    a hold. The signed path, shop, timestamp and HMAC must still be valid.
    """
    secret = _secret()
    if not secret:
        raise ShopifyBridgeError("shopify_not_configured")
    if not isinstance(query_string, str) or len(query_string) > 2000:
        raise ShopifyBridgeError("invalid_proxy_signature")
    parsed = parse_qs(query_string, keep_blank_values=True, strict_parsing=True)
    signature = parsed.pop("signature", [])
    if len(signature) != 1 or not re.fullmatch(r"[0-9a-f]{64}", signature[0]):
        raise ShopifyBridgeError("invalid_proxy_signature")
    material = "".join(sorted(
        key + "=" + ",".join(values) for key, values in parsed.items()
    )).encode("utf-8")
    expected = hmac.new(secret, material, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature[0]):
        raise ShopifyBridgeError("invalid_proxy_signature")
    if parsed.get("shop") != [_shop()]:
        raise ShopifyBridgeError("invalid_proxy_shop")
    expected_prefix = os.environ.get("MILE_SHOPIFY_PROXY_PATH_PREFIX", PROXY_PATH_DEFAULT)
    if parsed.get("path_prefix") != [expected_prefix]:
        raise ShopifyBridgeError("invalid_proxy_path")
    try:
        timestamp = int(parsed["timestamp"][0])
    except (KeyError, ValueError, TypeError, IndexError):
        raise ShopifyBridgeError("invalid_proxy_timestamp") from None
    now = int(time.time()) if now is None else int(now)
    if len(parsed.get("timestamp", [])) != 1 or abs(now - timestamp) > 300:
        raise ShopifyBridgeError("invalid_proxy_timestamp")
    return True


WEBHOOK_TOPICS = ("orders/paid", "orders/cancelled", "refunds/create")


def verify_webhook(body, headers, topic="orders/paid"):
    """Verify raw payload HMAC; never JSON-serialize it before validating."""
    if not webhook_enabled():
        raise ShopifyBridgeError("shopify_webhooks_disabled")
    if not isinstance(body, bytes) or len(body) > MAX_WEBHOOK:
        raise ShopifyBridgeError("invalid_webhook_body")
    if headers.get("X-Shopify-Shop-Domain", "").strip().lower() != _shop():
        raise ShopifyBridgeError("invalid_webhook_shop")
    if topic not in WEBHOOK_TOPICS or headers.get("X-Shopify-Topic") != topic:
        raise ShopifyBridgeError("unsupported_webhook_topic")
    signature = headers.get("X-Shopify-Hmac-Sha256", "")
    try:
        actual = base64.b64decode(signature, validate=True)
    except (ValueError, TypeError):
        raise ShopifyBridgeError("invalid_webhook_signature") from None
    expected = hmac.new(_secret(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, actual):
        raise ShopifyBridgeError("invalid_webhook_signature")
    delivery_id = headers.get("X-Shopify-Webhook-Id", "")
    if not DELIVERY_ID.fullmatch(delivery_id):
        raise ShopifyBridgeError("invalid_webhook_delivery")
    return delivery_id


def _hold_signature(identifier, variant_id, expiry):
    raw = f"the-mile-booking:v1:{identifier}:{variant_id}:{expiry}"
    secret = _secret()
    if not secret:
        raise ShopifyBridgeError("shopify_not_configured")
    return hmac.new(secret, raw.encode("utf-8"), hashlib.sha256).hexdigest()


_PT_WEEKDAYS = ("segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
                "sexta-feira", "sábado", "domingo")
_PT_MONTHS = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
              "agosto", "setembro", "outubro", "novembro", "dezembro")
_PT_MODES = {"presencial": "Presencial", "online": "Online"}


def visible_booking_details(hold, professional_name=None):
    """Customer-facing booking details shown in cart, checkout, order and emails.

    Display only: these properties are never read back when a paid order is
    processed. The booking itself is always taken from the server-side hold.
    """
    from datetime import date as _date
    from appointments_availability_v2 import display_time
    day = _date.fromisoformat(hold["day"])
    details = {
        "Data": "%s, %d de %s de %d" % (
            _PT_WEEKDAYS[day.weekday()], day.day, _PT_MONTHS[day.month - 1], day.year),
        "Hora": "%s – %s" % (display_time(hold["start_minute"]),
                             display_time(hold["end_minute"])),
        "Formato": _PT_MODES.get(hold["mode"], hold["mode"]),
    }
    if isinstance(professional_name, str) and professional_name.strip():
        details["Nutricionista"] = professional_name.strip()[:80]
    return details


def signed_cart_line(hold, c=None):
    """Opaque hold marker to attach to Shopify's AJAX cart line properties.

    The price/quantity/professional still come from server-side records, never
    from a cart property or browser input during webhook processing. Visible
    details (date, time, format, professional) are added after the private
    markers for the customer's benefit only.
    """
    if hold["status"] != "held" or hold["expires_at"] <= int(time.time()):
        raise ShopifyBridgeError("checkout_hold_closed")
    variant_gid = hold["shopify_variant_id"]
    if not re.fullmatch(r"gid://shopify/ProductVariant/[1-9][0-9]*", variant_gid):
        raise ShopifyBridgeError("checkout_variant_missing")
    variant = variant_gid.rsplit("/", 1)[1]
    return {
        "variant_id": int(variant),
        "quantity": 1,
        "properties": {
            "_the_mile_hold": hold["id"],
            "_the_mile_proof": _hold_signature(
                hold["id"], variant, hold["expires_at"]
            ),
            **visible_booking_details(hold, _professional_name(c, hold)),
        },
        "expires_at": hold["expires_at"],
        "hold_id": hold["id"],
        "professional_id": hold["professional_id"],
    }


def _professional_name(c, hold):
    if c is None:
        return None
    row = c.execute("""SELECT name FROM appt_professionals
        WHERE org_id=? AND id=?""", (ORG_ID, hold["professional_id"])).fetchone()
    return row["name"] if row else None


def create_checkout_hold(c, query, data, now=None):
    """The only prospective public write. Feature-gated and Shopify-signed."""
    verify_proxy(query, now=int(now.timestamp()) if now else None)
    import appointments_checkout_v2 as checkout
    if not isinstance(data, dict) or set(data) != {
        "professional_id", "service_id", "mode", "date", "start", "idempotency_key"
    }:
        raise ShopifyBridgeError("invalid_checkout_request")
    checkout.start_hold(c, data, "shopify-app-proxy", now=now, public=True)
    saved = c.execute("""SELECT * FROM appt_checkout_holds
        WHERE org_id=? AND idempotency_key=?""",
        (ORG_ID, data["idempotency_key"])).fetchone()
    if not saved:
        raise ShopifyBridgeError("checkout_hold_not_found")
    return signed_cart_line(saved, c)


def _props(line):
    result = {}
    values = line.get("properties", [])
    if not isinstance(values, list):
        return result
    for item in values:
        if not isinstance(item, dict):
            continue
        key = item.get("name")
        value = item.get("value")
        if key in ("_the_mile_hold", "_the_mile_proof"):
            if key in result or not isinstance(value, str):
                return {}
            result[key] = value
    return result


def _amount(value):
    try:
        raw = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return -1
    if not raw.is_finite() or raw < 0:
        return -1
    cents = raw * 100
    return int(cents) if cents == cents.to_integral_value() else -1


def _review(c, order, hold_id, reason, now):
    c.execute("""INSERT INTO appt_shopify_payment_reviews
        (id,org_id,order_id,hold_id,reason,created_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING""",
        (secrets.token_hex(16), ORG_ID, order, hold_id, reason, now))
    return "payment_review"


def _customer(order):
    first = (order.get("customer") or {})
    if not isinstance(first, dict):
        first = {}
    name = " ".join([
        str(first.get("first_name") or "").strip(),
        str(first.get("last_name") or "").strip()
    ]).strip()[:140]
    if not name:
        name = str(order.get("name") or "").strip()[:140]
    email = str(order.get("email") or order.get("contact_email") or "").strip()[:254]
    phone = str(order.get("phone") or "").strip()
    if not phone:
        for key in ("billing_address", "shipping_address"):
            address = order.get(key)
            if isinstance(address, dict) and address.get("phone"):
                phone = str(address.get("phone")).strip()
                break
    if not phone and isinstance(order.get("customer"), dict):
        phone = str(order["customer"].get("phone") or "").strip()
    return name or "Cliente Shopify", email, phone[:45]


def process_paid_order(c, order, delivery_id, now=None):
    """Idempotent payment confirmation, atomic with hold & order record.

    Caller must verify Shopify webhook HMAC and shop before calling. Never
    turn a late payment into a competing booking.
    """
    import appointments_bookings_v2 as bookings
    import appointments_google_v2 as google
    if not isinstance(order, dict):
        raise ShopifyBridgeError("invalid_order")
    order_id = str(order.get("id") or "")
    if not ORDER_ID.fullmatch(order_id):
        raise ShopifyBridgeError("invalid_order")
    epoch = int(time.time()) if now is None else int(now)
    shop = _shop()
    previous = c.execute("""SELECT result FROM appt_shopify_webhook_deliveries
        WHERE org_id=? AND shop_domain=? AND delivery_id=?""",
        (ORG_ID, shop, delivery_id)).fetchone()
    if previous:
        return previous["result"]

    lines = order.get("line_items", [])
    if not isinstance(lines, list) or len(lines) > 250:
        raise ShopifyBridgeError("invalid_order")
    booking_lines = [line for line in lines if isinstance(line, dict)
                     and any(isinstance(p, dict) and
                       p.get("name") in ("_the_mile_hold","_the_mile_proof")
                       for p in (line.get("properties") or []) if isinstance(line.get("properties"), list))]
    if not booking_lines:
        result = "ignored"
    elif len(booking_lines) != 1:
        result = _review(c, order_id, None, "multiple_booking_items", epoch)
    else:
        line = booking_lines[0]
        properties = _props(line)
        hold_id = properties.get("_the_mile_hold", "")
        row = c.execute("""SELECT * FROM appt_checkout_holds
            WHERE org_id=? AND id=?""", (ORG_ID, hold_id)).fetchone() if HEX_ID.fullmatch(hold_id) else None
        if not row:
            result = _review(c, order_id, None, "unknown_hold", epoch)
        else:
            bookings._acquire_transaction_locks(c, ORG_ID, [row["professional_id"]])
            row = c.execute("""SELECT * FROM appt_checkout_holds
                WHERE org_id=? AND id=?""", (ORG_ID, hold_id)).fetchone()
            variant = row["shopify_variant_id"].rsplit("/", 1)[-1]
            signed = _hold_signature(row["id"], variant, row["expires_at"])
            if row["status"] == "confirmed" and row["shopify_order_id"] == order_id:
                result = "confirmed"
            elif (not hmac.compare_digest(
                    properties.get("_the_mile_proof", ""), signed)):
                result = _review(c, order_id, hold_id, "invalid_hold_proof", epoch)
            elif order.get("financial_status") != "paid":
                result = _review(c, order_id, hold_id, "not_paid", epoch)
            elif order.get("currency") != "EUR":
                result = _review(c, order_id, hold_id, "currency_mismatch", epoch)
            elif (str(line.get("variant_id")) != variant or
                  line.get("quantity") != 1 or
                  _amount(line.get("price")) != row["price_cents"]):
                result = _review(c, order_id, hold_id, "variant_or_price_mismatch", epoch)
            elif row["status"] != "held" or row["expires_at"] <= epoch:
                result = _review(c, order_id, hold_id, "hold_expired_or_closed", epoch)
            elif c.execute("""SELECT 1 FROM appt_checkout_holds
                  WHERE org_id=? AND professional_id=? AND id<>?
                    AND (status='confirmed' OR (status='held' AND expires_at>?))
                    AND start_utc<? AND end_utc>? LIMIT 1""",
                     (ORG_ID, row["professional_id"], hold_id, epoch,
                      row["end_utc"], row["start_utc"])).fetchone():
                result = _review(c, order_id, hold_id, "checkout_conflict", epoch)
            elif c.execute("""SELECT 1 FROM appt_bookings
                 WHERE org_id=? AND professional_id=? AND status='scheduled'
                   AND start_utc<? AND end_utc>? LIMIT 1""",
                    (ORG_ID, row["professional_id"],row["end_utc"],
                     row["start_utc"])).fetchone():
                result = _review(c, order_id, hold_id, "manual_conflict", epoch)
            elif c.execute("""SELECT 1 FROM appt_shopify_confirmations
                 WHERE org_id=? AND shopify_order_id=? LIMIT 1""",
                    (ORG_ID, order_id)).fetchone():
                result = _review(c, order_id, hold_id, "order_already_used", epoch)
            else:
                # Google availability is advisory when not connected and fails
                # closed if selected calendars cannot be reached.
                from datetime import datetime as _datetime
                try:
                    busy = google.busy_intervals(c, ORG_ID, row["professional_id"],
                       _datetime.fromtimestamp(row["start_utc"],timezone.utc),
                       _datetime.fromtimestamp(row["end_utc"],timezone.utc))
                    occupied = any(
                        row["start_utc"] < int(end.timestamp()) and
                        int(start.timestamp()) < row["end_utc"]
                        for start, end in busy)
                except google.GoogleCalendarError:
                    occupied = True
                if occupied:
                    result = _review(c, order_id, hold_id, "calendar_unavailable_or_busy", epoch)
                else:
                    name, email, phone = _customer(order)
                    c.execute("""UPDATE appt_checkout_holds
                        SET status='confirmed',shopify_order_id=?,updated_at=?
                        WHERE id=? AND org_id=? AND status='held'""",
                        (order_id,epoch,hold_id,ORG_ID))
                    c.execute("""INSERT INTO appt_shopify_confirmations
                        (hold_id,org_id,shopify_order_id,customer_name,
                         customer_email,customer_phone,created_at)
                        VALUES(?,?,?,?,?,?,?)""",
                        (hold_id,ORG_ID,order_id,name,email,phone,epoch))
                    result = "confirmed"
    c.execute("""INSERT INTO appt_shopify_webhook_deliveries
        (org_id,shop_domain,delivery_id,order_id,result,created_at)
        VALUES(?,?,?,?,?,?)""", (ORG_ID,shop,delivery_id,order_id,result,epoch))
    return result


def paid_webhook(c, body, headers, now=None):
    delivery_id = verify_webhook(body, headers)
    try:
        data = json.loads(body)
    except (ValueError, UnicodeError):
        raise ShopifyBridgeError("invalid_webhook_json") from None
    return process_paid_order(c, data, delivery_id, now=now)


def _record_change(c, hold, action, reason, epoch, actor=None, new=None):
    c.execute("""INSERT INTO appt_shopify_booking_changes
        (id,org_id,hold_id,shopify_order_id,action,reason,actor_id,
         previous_professional_id,previous_day,previous_start_minute,
         current_professional_id,current_day,current_start_minute,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
        secrets.token_hex(16), ORG_ID, hold["id"], hold["shopify_order_id"] or "",
        action, reason, actor, hold["professional_id"], hold["day"],
        hold["start_minute"],
        new["professional_id"] if new else None,
        new["day"] if new else None,
        new["start_minute"] if new else None, epoch))


def _release_paid_hold(c, order_id, reason, epoch, line_matches=None):
    """Free the slot of a Shopify-paid booking. Never touches manual bookings."""
    import appointments_bookings_v2 as bookings
    row = c.execute("""SELECT * FROM appt_checkout_holds
        WHERE org_id=? AND shopify_order_id=?""", (ORG_ID, order_id)).fetchone()
    if not row:
        return "ignored"
    if line_matches is not None and not line_matches(row):
        return "ignored"
    bookings._acquire_transaction_locks(c, ORG_ID, [row["professional_id"]])
    row = c.execute("""SELECT * FROM appt_checkout_holds
        WHERE org_id=? AND id=?""", (ORG_ID, row["id"])).fetchone()
    if row["status"] != "confirmed":
        return "already_released" if row["status"] == "released" else "ignored"
    c.execute("""UPDATE appt_checkout_holds SET status='released',updated_at=?
        WHERE org_id=? AND id=? AND status='confirmed'""",
        (epoch, ORG_ID, row["id"]))
    _record_change(c, row, "released", reason, epoch)
    return "released"


def _delivery_result(c, delivery_id):
    previous = c.execute("""SELECT result FROM appt_shopify_webhook_deliveries
        WHERE org_id=? AND shop_domain=? AND delivery_id=?""",
        (ORG_ID, _shop(), delivery_id)).fetchone()
    return previous["result"] if previous else None


def _store_delivery(c, delivery_id, order_id, result, epoch):
    c.execute("""INSERT INTO appt_shopify_webhook_deliveries
        (org_id,shop_domain,delivery_id,order_id,result,created_at)
        VALUES(?,?,?,?,?,?)""", (ORG_ID,_shop(),delivery_id,order_id,result,epoch))


def process_cancelled_order(c, order, delivery_id, now=None):
    """Shopify order cancelled (usually with refund): free the booked slot."""
    if not isinstance(order, dict):
        raise ShopifyBridgeError("invalid_order")
    order_id = str(order.get("id") or "")
    if not ORDER_ID.fullmatch(order_id):
        raise ShopifyBridgeError("invalid_order")
    epoch = int(time.time()) if now is None else int(now)
    previous = _delivery_result(c, delivery_id)
    if previous:
        return previous
    result = _release_paid_hold(c, order_id, "shopify_order_cancelled", epoch)
    _store_delivery(c, delivery_id, order_id, result, epoch)
    return result


def process_refund(c, refund, delivery_id, now=None):
    """Refund that includes the booking line: free the slot. Refunds of other
    products, or amount-only refunds, leave the booking untouched."""
    if not isinstance(refund, dict):
        raise ShopifyBridgeError("invalid_refund")
    order_id = str(refund.get("order_id") or "")
    if not ORDER_ID.fullmatch(order_id):
        raise ShopifyBridgeError("invalid_refund")
    epoch = int(time.time()) if now is None else int(now)
    previous = _delivery_result(c, delivery_id)
    if previous:
        return previous
    items = refund.get("refund_line_items")
    items = items if isinstance(items, list) else []

    def matches(hold):
        variant = str(hold["shopify_variant_id"]).rsplit("/", 1)[-1]
        for item in items[:250]:
            line = item.get("line_item") if isinstance(item, dict) else None
            if not isinstance(line, dict):
                continue
            if _props(line).get("_the_mile_hold") == hold["id"]:
                return True
            if str(line.get("variant_id") or "") == variant:
                return True
        return False

    result = _release_paid_hold(c, order_id, "shopify_refund", epoch, matches)
    _store_delivery(c, delivery_id, order_id, result, epoch)
    return result


def handle_webhook(c, body, headers, topic, now=None):
    delivery_id = verify_webhook(body, headers, topic)
    try:
        data = json.loads(body)
    except (ValueError, UnicodeError):
        raise ShopifyBridgeError("invalid_webhook_json") from None
    if topic == "orders/paid":
        return process_paid_order(c, data, delivery_id, now=now)
    if topic == "orders/cancelled":
        return process_cancelled_order(c, data, delivery_id, now=now)
    return process_refund(c, data, delivery_id, now=now)


def reschedule_paid(c, hold_id, payload, actor, now=None):
    """Move a Shopify-paid booking to another free slot (same service & format,
    so the price paid stays valid). Reuses the manual-booking validation."""
    import appointments_bookings_v2 as bookings
    if not isinstance(payload, dict) or not HEX_ID.fullmatch(str(hold_id)):
        raise ValueError("invalid_request")
    row = c.execute("""SELECT * FROM appt_checkout_holds WHERE org_id=? AND id=?""",
                    (ORG_ID, hold_id)).fetchone()
    if not row or not c.execute("""SELECT 1 FROM appt_shopify_confirmations
            WHERE org_id=? AND hold_id=?""", (ORG_ID, hold_id)).fetchone():
        raise LookupError("booking_not_found")
    pid = payload.get("professional_id")
    if not isinstance(pid, str) or not pid or len(pid) > 70:
        raise ValueError("invalid_professional")
    bookings._acquire_transaction_locks(c, ORG_ID, [row["professional_id"], pid])
    row = c.execute("""SELECT * FROM appt_checkout_holds WHERE org_id=? AND id=?""",
                    (ORG_ID, hold_id)).fetchone()
    if row["status"] != "confirmed":
        raise ValueError("booking_cancelled")
    if payload.get("version") != row["updated_at"]:
        raise ValueError("stale_booking")
    candidate = {"professional_id": pid, "service_id": row["service_id"],
                 "mode": row["mode"], "date": payload.get("date"),
                 "start": payload.get("start")}
    # The booking must not conflict with itself while it is being moved.
    c.execute("""UPDATE appt_checkout_holds SET status='released'
        WHERE org_id=? AND id=? AND status='confirmed'""", (ORG_ID, hold_id))
    try:
        values = bookings._validate_candidate(c, ORG_ID, candidate, now=now)
    except Exception:
        c.execute("""UPDATE appt_checkout_holds SET status='confirmed'
            WHERE org_id=? AND id=? AND status='released'""", (ORG_ID, hold_id))
        raise
    pid, _sid, _mode, day, start, end, start_utc, end_utc = values
    epoch = int(time.time())
    if epoch <= row["updated_at"]:
        epoch = row["updated_at"] + 1
    c.execute("""UPDATE appt_checkout_holds SET status='confirmed',
        professional_id=?,day=?,start_minute=?,end_minute=?,start_utc=?,end_utc=?,
        updated_at=? WHERE org_id=? AND id=?""",
        (pid, day, start, end, start_utc, end_utc, epoch, ORG_ID, hold_id))
    _record_change(c, row, "rescheduled", "backoffice", epoch, actor,
                   {"professional_id": pid, "day": day, "start_minute": start})
    return hold_id


def payment_summary(c, now=None):
    epoch = int(time.time()) if now is None else int(now)
    confirmed = c.execute("""SELECT COUNT(*) AS n FROM appt_shopify_confirmations
        WHERE org_id=?""", (ORG_ID,)).fetchone()["n"]
    reviews = c.execute("""SELECT COUNT(*) AS n FROM appt_shopify_payment_reviews
        WHERE org_id=?""", (ORG_ID,)).fetchone()["n"]
    # Audit the CURRENT database configuration: these values may differ from
    # the catalogue seeds and cannot be inferred from the Shopify storefront.
    formats = c.execute("""SELECT f.shopify_variant_id,f.price_cents
        FROM appt_service_formats f JOIN appt_services s
          ON s.org_id=f.org_id AND s.id=f.service_id
        WHERE f.org_id=? AND f.enabled=1 AND s.active=1""",
        (ORG_ID,)).fetchall()
    mapped = sum(
        bool(VARIANT_GID_RE.fullmatch(row["shopify_variant_id"] or ""))
        and isinstance(row["price_cents"], int)
        and row["price_cents"] >= 0
        for row in formats
    )
    return {
        # Presence only: never return secret, token or webhook payload content.
        "shopify_app_secret_configured": _secret() is not None,
        "shopify_expected_shop": _shop() == SHOP_DEFAULT,
        "service_formats_enabled": len(formats),
        "service_formats_mapped": mapped,
        # Cannot infer a real app installation from credentials in Render.
        "shopify_app_installation_verified": None,
        "webhooks_enabled": webhook_enabled(),
        "checkout_enabled": checkout_enabled(),
        "sesami_migration_verified": _flag("MILE_SHOPIFY_SESAMI_MIGRATED"),
        "manual_calendar_mode_enabled": manual_calendar_mode_enabled(),
        "confirmed_shopify_bookings": confirmed,
        "payments_requiring_review": reviews,
        "processed_deliveries": c.execute(
            "SELECT COUNT(*) AS n FROM appt_shopify_webhook_deliveries WHERE org_id=?",
            (ORG_ID,)).fetchone()["n"],
        "confirmation_without_google_event": True,
    }
