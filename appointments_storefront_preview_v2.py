"""Read-only storefront preview of The Mile's actual appointment availability.

Exposes only public-facing service/professional identity and booking times.
No emails, phone numbers, block reasons, clients, order IDs, OAuth tokens,
private images, checkout operations or authenticated admin endpoints.
The storefront theme must remain an UNPUBLISHED preview until Sesami
migration and Shopify checkout/payment verification are complete.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import appointments_catalog_v2 as catalog
import appointments_availability_v2 as availability

ORG_ID = catalog.ORG_ID
LISBON = ZoneInfo("Europe/Lisbon")


def public_catalog(c, now=None):
    """Allowlist only fields suitable for an eventual public booking calendar."""
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(LISBON).date()
    source = catalog.catalog(c, ORG_ID)
    active_people = {
        person["id"]: person
        for person in source["professionals"]
        if person["active"]
    }

    services = []
    attached = set()
    for service in source["services"]:
        if not service["active"]:
            continue
        formats = {
            mode: {"price_cents": int(config["price_cents"])}
            for mode, config in service["formats"].items()
            if mode in catalog.MODES and config["enabled"]
        }
        if not formats:
            continue
        eligible = []
        for professional_id in service["professional_ids"]:
            person = active_people.get(professional_id)
            if person and any(person[mode + "_enabled"] for mode in formats):
                eligible.append(professional_id)
        if not eligible:
            continue
        services.append({
            "id": service["id"],
            "name": service["name"],
            "category": service["category"],
            "duration_minutes": service["duration_minutes"],
            "formats": formats,
            "professional_ids": sorted(eligible),
        })
        attached.update(eligible)

    people = []
    for pid in sorted(attached, key=lambda p: active_people[p]["name"].casefold()):
        person = active_people[pid]
        people.append({
            "id": pid,
            "name": person["name"],
            "modes": [mode for mode in catalog.MODES if person[mode + "_enabled"]],
            "service_ids": [s["id"] for s in services if pid in s["professional_ids"]],
        })
    return {
        "services": services,
        "professionals": people,
        "today": today.isoformat(),
        "last_bookable_date": (today + timedelta(days=60)).isoformat(),
        "timezone": "Europe/Lisbon",
        "interval_minutes": 15,
        "preview_only": True,
        "checkout_enabled": False,
        "sesami_integrated": False,
    }


def _eligible(c, professional_id, service_id, mode):
    """Check every public lookup against active service, person and assignment."""
    if mode not in catalog.MODES:
        raise ValueError("invalid_mode")
    if not isinstance(professional_id, str) or not 1 <= len(professional_id) <= 70:
        raise ValueError("invalid_professional")
    if not isinstance(service_id, str) or not 1 <= len(service_id) <= 70:
        raise ValueError("invalid_service")

    match = c.execute("""
       SELECT 1 FROM appt_professional_services ps
       JOIN appt_professionals p ON p.id=ps.professional_id AND p.org_id=ps.org_id
       JOIN appt_services s ON s.id=ps.service_id AND s.org_id=ps.org_id
       JOIN appt_service_formats f ON f.org_id=s.org_id AND f.service_id=s.id
       WHERE ps.org_id=? AND ps.professional_id=? AND ps.service_id=? AND f.mode=?
         AND p.active=1 AND s.active=1 AND f.enabled=1
         AND ((f.mode='presencial' AND p.presencial_enabled=1)
          OR (f.mode='online' AND p.online_enabled=1))
       LIMIT 1
    """, (ORG_ID, professional_id, service_id, mode)).fetchone()
    if not match:
        raise LookupError("booking_selection_not_found")


def _window(now):
    today = now.astimezone(LISBON).date()
    return today, today + timedelta(days=60)


def public_month(c, professional_id, service_id, mode, month, now=None):
    now = now or datetime.now(timezone.utc)
    _eligible(c, professional_id, service_id, mode)
    # Block enumeration of arbitrary historical dates and far-future periods.
    if not isinstance(month, str) or len(month) != 7:
        raise ValueError("invalid_month")
    try:
        first = availability.clean_date(month + "-01")
    except ValueError:
        raise ValueError("invalid_month") from None
    today, last = _window(now)
    if (first.year, first.month) < (today.year, today.month) or (
        first.year, first.month) > (last.year, last.month):
        raise ValueError("outside_booking_window")
    result = availability.month_preview(
        c, ORG_ID, professional_id, service_id, mode, month, now=now,
    )
    return {
        "month": result["month"],
        "days": [
            {"date": item["date"], "available": bool(item["available"])}
            for item in result["days"]
        ],
        "timezone": "Europe/Lisbon",
        "preview_only": True,
        "checkout_enabled": False,
        "sesami_integrated": False,
    }


def public_day(c, professional_id, service_id, mode, day, now=None):
    now = now or datetime.now(timezone.utc)
    _eligible(c, professional_id, service_id, mode)
    date = availability.clean_date(day)
    today, last = _window(now)
    if date < today or date > last:
        raise ValueError("outside_booking_window")
    result = availability.preview(
        c, ORG_ID, professional_id, service_id, mode, day, now=now,
    )
    return {
        "date": date.isoformat(),
        "slots": [
            {"start": item["start"], "end": item["end"]}
            for item in result["slots"]
        ],
        "timezone": "Europe/Lisbon",
        "preview_only": True,
        "checkout_enabled": False,
        "sesami_integrated": False,
    }
