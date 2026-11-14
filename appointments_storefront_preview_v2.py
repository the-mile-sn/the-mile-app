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
import appointments_assignment_v2 as assignment
import appointments_shopify_bridge_v2 as shopify_bridge
import appointments_rules_v2 as rules

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
            "has_photo": bool(person.get("has_photo")),
            "modes": [mode for mode in catalog.MODES if person[mode + "_enabled"]],
            "service_ids": [s["id"] for s in services if pid in s["professional_ids"]],
        })
    return {
        "services": services,
        "professionals": people,
        "today": today.isoformat(),
        "last_bookable_date": (today + timedelta(days=60)).isoformat(),
        "timezone": "Europe/Lisbon",
        "interval_minutes": rules.get(c, ORG_ID)["start_interval_minutes"],
        "any_professional_supported": True,
        "preview_only": True,
        "checkout_enabled": shopify_bridge.checkout_enabled(),
        "sesami_integrated": False,
    }


def _window(now):
    today = now.astimezone(LISBON).date()
    return today, today + timedelta(days=60)


def _preview_eligible(c, professional_id, service_id, mode):
    """Reject inactive providers, unrelated service combinations, and bad IDs."""
    return assignment.candidates(c, ORG_ID, professional_id, service_id, mode)


def public_month(c, professional_id, service_id, mode, month, now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("invalid_now")
    people = _preview_eligible(c, professional_id, service_id, mode)
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

    # Union of eligible providers: a day is selectable if any provider is free.
    # Google free/busy failures propagate (fail closed) rather than invent slots.
    grouped = {}
    for person in people:
        result = availability.month_preview(
            c, ORG_ID, person["id"], service_id, mode, month, now=now,
        )
        for item in result["days"]:
            grouped[item["date"]] = (
                grouped.get(item["date"], False) or bool(item["available"])
            )
    return {
        "month": month,
        "days": [{"date": date, "available": grouped[date]}
                 for date in sorted(grouped)],
        "timezone": "Europe/Lisbon",
        "preview_only": True,
        "checkout_enabled": shopify_bridge.checkout_enabled(),
        "sesami_integrated": False,
        "any_professional": professional_id == assignment.ANY_PROFESSIONAL,
    }


def public_day(c, professional_id, service_id, mode, day, now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("invalid_now")
    people = _preview_eligible(c, professional_id, service_id, mode)
    date = availability.clean_date(day)
    today, last = _window(now)
    if date < today or date > last:
        raise ValueError("outside_booking_window")
    combined = {}
    for person in people:
        result = availability.preview(
            c, ORG_ID, person["id"], service_id, mode, day, now=now,
        )
        for slot in result["slots"]:
            key = (slot["start"], slot["end"])
            combined.setdefault(key, set()).add(person["id"])

    any_selection = professional_id == assignment.ANY_PROFESSIONAL
    slots = []
    if any_selection:
        ranked_ids = assignment.ranked_professionals(
            c, ORG_ID, people, date, now=now,
        )
        for (start, end), ids in sorted(combined.items()):
            suggested = next((pid for pid in ranked_ids if pid in ids), None)
            if not suggested:
                continue
            slots.append({
                "start": start, "end": end,
                "professional_count": len(ids),
                # Informational only: recompute under locks when creating a hold.
                "suggested_professional_id": suggested,
            })
    else:
        slots = [{"start": start, "end": end}
                 for start, end in sorted(combined)]
    return {
        "date": date.isoformat(),
        "slots": slots,
        "timezone": "Europe/Lisbon",
        "preview_only": True,
        "checkout_enabled": shopify_bridge.checkout_enabled(),
        "sesami_integrated": False,
        "any_professional": any_selection,
        "provisional_assignment": any_selection,
    }
