"""Isolated Shopify orders/paid smoke test for The Mile administrators.

Uses the currently configured real webhook secret *inside the server*.
No Shopify order or payment is created. The synthetic order deliberately has
no The Mile booking line; all test writes are rolled back with SAVEPOINT.
This does not claim to test Shopify-originated webhook delivery.
"""
import base64
import hashlib
import hmac
import json
import secrets

import appointments_shopify_bridge_v2 as bridge


class SmokeTestError(ValueError):
    pass


def _must_reject(c, body, headers, expected):
    try:
        bridge.paid_webhook(c, body, headers)
    except bridge.ShopifyBridgeError as exc:
        if str(exc) == expected:
            return True
    raise SmokeTestError("smoke_webhook_validation_failed")


def run_signed_smoke(c):
    if not bridge.webhook_enabled() or not bridge._secret():
        raise SmokeTestError("smoke_webhook_not_configured")

    # Valid numeric Shopify-like order ID, but no booking lines or customer data.
    fake_order = {
        "id": int("9" + str(secrets.randbelow(10**13)).zfill(13)),
        "financial_status": "paid",
        "currency": "EUR",
        "line_items": [],
    }
    body = json.dumps(fake_order, separators=(",", ":")).encode("utf-8")
    delivery = "mile-safe-smoke-" + secrets.token_hex(12)
    signature = base64.b64encode(
        hmac.new(bridge._secret(), body, hashlib.sha256).digest()
    ).decode("ascii")
    headers = {
        "X-Shopify-Shop-Domain": bridge._shop(),
        "X-Shopify-Topic": "orders/paid",
        "X-Shopify-Hmac-Sha256": signature,
        "X-Shopify-Webhook-Id": delivery,
    }
    c.execute("SAVEPOINT mile_webhook_smoke")
    try:
        first = bridge.paid_webhook(c, body, headers)
        repeated = bridge.paid_webhook(c, body, headers)
        if first != "ignored" or repeated != "ignored":
            raise SmokeTestError("smoke_unassociated_order_not_ignored")

        recorded = c.execute("""SELECT result FROM appt_shopify_webhook_deliveries
            WHERE org_id=? AND shop_domain=? AND delivery_id=?""",
            (bridge.ORG_ID, bridge._shop(), delivery)).fetchone()
        if not recorded or recorded["result"] != "ignored":
            raise SmokeTestError("smoke_delivery_tracking_failed")

        forged = dict(headers)
        forged["X-Shopify-Hmac-Sha256"] = base64.b64encode(b"x" * 32).decode()
        _must_reject(c, body, forged, "invalid_webhook_signature")

        wrong_shop = dict(headers)
        wrong_shop["X-Shopify-Shop-Domain"] = "other-shop.myshopify.com"
        _must_reject(c, body, wrong_shop, "invalid_webhook_shop")

        wrong_topic = dict(headers)
        wrong_topic["X-Shopify-Topic"] = "orders/create"
        _must_reject(c, body, wrong_topic, "unsupported_webhook_topic")

        invalid_json = b"{"
        bad_json_header = dict(headers)
        bad_json_header["X-Shopify-Hmac-Sha256"] = base64.b64encode(
            hmac.new(bridge._secret(), invalid_json, hashlib.sha256).digest()
        ).decode("ascii")
        _must_reject(c, invalid_json, bad_json_header, "invalid_webhook_json")
    finally:
        # Always undo even the harmless ignored-delivery ledger write.
        c.execute("ROLLBACK TO SAVEPOINT mile_webhook_smoke")
        c.execute("RELEASE SAVEPOINT mile_webhook_smoke")

    survived = c.execute("""SELECT 1 FROM appt_shopify_webhook_deliveries
        WHERE org_id=? AND shop_domain=? AND delivery_id=?""",
        (bridge.ORG_ID, bridge._shop(), delivery)).fetchone()
    if survived:
        raise SmokeTestError("smoke_rollback_failed")
    return {
        "type": "internal_signed_simulation",
        "signature_accepted": True,
        "unrelated_order_ignored": True,
        "duplicate_delivery_idempotent": True,
        "forged_signature_rejected": True,
        "wrong_shop_rejected": True,
        "wrong_topic_rejected": True,
        "invalid_json_rejected": True,
        "database_changes_persisted": False,
        "created_order": False,
        "created_booking": False,
        "charged_payment": False,
        "shopify_originated_delivery_verified": False,
        "checkout_enabled": bridge.checkout_enabled(),
    }
