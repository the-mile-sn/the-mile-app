"""Admin-only Google Calendar coverage for safely opening The Mile Booking.

Counts only active professionals linked to active published services, without
exposing calendar identifiers, OAuth tokens or customer appointment details.
A Google event by itself does not block checkout unless that professional has
connected Google and chosen at least one calendar to block availability.
"""
import appointments_catalog_v2 as catalogue
import appointments_google_v2 as google


def readiness(c):
    source = catalogue.catalog(c)
    relevant = set()
    active_people = {
        person["id"]: person for person in source["professionals"]
        if person["active"]
    }
    for service in source["services"]:
        if not service["active"]:
            continue
        modes = [mode for mode in catalogue.MODES
                 if (service["formats"].get(mode) or {}).get("enabled")]
        for pid in service["professional_ids"]:
            person = active_people.get(pid)
            if person and any(person[mode + "_enabled"] for mode in modes):
                relevant.add(pid)

    rows = []
    for pid in sorted(relevant, key=lambda item: active_people[item]["name"].casefold()):
        person = active_people[pid]
        status = google.status(c, catalogue.ORG_ID, pid)
        rows.append({
            "professional_name": person["name"],
            "connected": status["connected"],
            "blocking_active": status["busy_check_active"],
        })
    ready = bool(rows) and all(row["blocking_active"] for row in rows)
    missing = [row["professional_name"] for row in rows if not row["blocking_active"]]
    return {
        "google_configured": google.configured(),
        "professionals_to_check": len(rows),
        "professionals_blocking_google": len(rows) - len(missing),
        "all_professionals_blocking_google": ready,
        "professionals_missing_google_blocking": missing,
        "read_only": True,
        "customer_data_exposed": False,
        "external_calendar_events_modified": False,
    }
