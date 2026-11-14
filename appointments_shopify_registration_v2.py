"""One-click, admin-only registration of the The Mile Booking paid-order webhook.

This uses ONLY The Mile Booking's own client ID and secret in Render.
It never uses the ChatGPT Shopify connector credentials. Shopify access tokens
remain server-side. Does not enable customer checkout, migrate Sesami or
confirm orders. Requires webhook ingestion to be explicitly enabled first.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from appointments_shopify_bridge_v2 import (
    SHOP_DEFAULT, _secret, _shop, webhook_enabled
)

API_VERSION = "2026-10"
TOPIC = "ORDERS_PAID"
CALLBACK_URL = "https://admin.themile.pt/api/v2/shopify/webhooks/orders-paid"
MAX_RESPONSE = 150_000
CLIENT_ID_RE = re.compile(r"[a-fA-F0-9]{32}\Z")


class ShopifyRegistrationError(ValueError):
    pass


def client_id():
    value = os.environ.get("MILE_SHOPIFY_CLIENT_ID", "").strip()
    return value if CLIENT_ID_RE.fullmatch(value) else None


def setup_status():
    return {
        "shop_domain_valid": _shop() == SHOP_DEFAULT,
        "client_id_configured": client_id() is not None,
        "secret_configured": _secret() is not None,
        "webhook_receiver_enabled": webhook_enabled(),
        "checkout_enabled": False,  # This setup never activates checkout.
        "topic": "orders/paid",
        "destination": CALLBACK_URL,
        "shopify_subscription_verified": None,
    }


def _ready():
    if not (client_id() and _secret() and webhook_enabled() and _shop() == SHOP_DEFAULT):
        raise ShopifyRegistrationError("shopify_registration_not_ready")


def _request_json(url, body, headers):
    """HTTPS-only Shopify call, with max response size and no secret logging."""
    if not (url.startswith("https://" + SHOP_DEFAULT + "/") and
            not url.startswith("https://" + SHOP_DEFAULT + "//")):
        raise ShopifyRegistrationError("shopify_registration_invalid_destination")
    payload = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise ShopifyRegistrationError("shopify_registration_response_too_large")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("unexpected_response")
        return result
    except (urllib.error.URLError, TimeoutError, ValueError, UnicodeError, OSError):
        raise ShopifyRegistrationError("shopify_registration_unavailable") from None


def _token():
    _ready()
    form = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id(),
        "client_secret": _secret().decode("utf-8"),
    }).encode("utf-8")
    data = _request_json(
        "https://" + SHOP_DEFAULT + "/admin/oauth/access_token",
        form,
        {"Content-Type": "application/x-www-form-urlencoded",
         "Accept": "application/json"},
    )
    token = data.get("access_token")
    if not isinstance(token, str) or not 8 <= len(token) <= 8192:
        raise ShopifyRegistrationError("shopify_registration_auth_failed")
    return token


def _graphql(token, query, variables=None):
    response = _request_json(
        "https://" + SHOP_DEFAULT + "/admin/api/" + API_VERSION + "/graphql.json",
        {"query": query, "variables": variables or {}},
        {"Content-Type": "application/json",
         "Accept": "application/json",
         "X-Shopify-Access-Token": token},
    )
    if response.get("errors"):
        # Never return verbatim Shopify diagnostic content to the browser.
        raise ShopifyRegistrationError("shopify_registration_graphql_failed")
    result = response.get("data")
    if not isinstance(result, dict):
        raise ShopifyRegistrationError("shopify_registration_graphql_failed")
    return result


def _find_subscription(token):
    """Shop-scoped subscriptions belonging to THIS application only."""
    query = """query MilePaidWebhook($after: String) {
      webhookSubscriptions(first: 50, after: $after, topics: [ORDERS_PAID]) {
        nodes { id topic uri }
        pageInfo { hasNextPage endCursor }
      }
    }"""
    cursor = None
    for _ in range(8):
        data = _graphql(token, query, {"after": cursor})
        connection = data.get("webhookSubscriptions") or {}
        for item in connection.get("nodes") or []:
            if (item.get("topic") == TOPIC and
                    item.get("uri") == CALLBACK_URL):
                return item.get("id")
        page = connection.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            return None
        cursor = page.get("endCursor")
        if not isinstance(cursor, str) or not cursor:
            break
    raise ShopifyRegistrationError("shopify_registration_too_many_webhooks")


def register_paid_webhook():
    """Call only from an authenticated + CSRF-protected The Mile admin action.

    Idempotent: no second webhook is created if destination already exists.
    """
    token = _token()
    existing = _find_subscription(token)
    if existing:
        return {"status": "already_registered", "topic": "orders/paid",
                "destination": CALLBACK_URL, "verified": True}
    mutation = """mutation RegisterMilePaidWebhook($url: String!) {
      webhookSubscriptionCreate(
        topic: ORDERS_PAID,
        webhookSubscription: {uri: $url, format: JSON}
      ) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }"""
    data = _graphql(token, mutation, {"url": CALLBACK_URL})
    result = data.get("webhookSubscriptionCreate") or {}
    if result.get("userErrors"):
        raise ShopifyRegistrationError("shopify_registration_rejected")
    item = result.get("webhookSubscription") or {}
    if item.get("topic") != TOPIC or item.get("uri") != CALLBACK_URL:
        raise ShopifyRegistrationError("shopify_registration_failed")
    return {"status": "registered", "topic": "orders/paid",
            "destination": CALLBACK_URL, "verified": True}
