"""Shared professional selection for the The Mile booking preview and future holds.

Only professionals actively associated with the selected service and format
are eligible. This never books an appointment on its own. Any-professional
checkout selection must happen under the existing professional transaction
locks and be checked again before persisting a hold.
"""
from datetime import datetime, timezone

from appointments_catalog_v2 import MODES

ANY_PROFESSIONAL = "any"
MAX_PROFESSIONALS = 100


def eligible_professionals(c, org_id, service_id, mode):
    if not isinstance(service_id, str) or not 0 < len(service_id) <= 70:
        raise ValueError("invalid_service")
    if mode not in MODES:
        raise ValueError("invalid_mode")
    rows = c.execute("""
        SELECT p.id, p.name FROM appt_professional_services ps
        JOIN appt_professionals p ON p.id=ps.professional_id AND p.org_id=ps.org_id
        JOIN appt_services s ON s.id=ps.service_id AND s.org_id=ps.org_id
        JOIN appt_service_formats f ON f.org_id=s.org_id AND f.service_id=s.id
        WHERE ps.org_id=? AND ps.service_id=? AND f.mode=?
          AND p.active=1 AND s.active=1 AND f.enabled=1
          AND ((f.mode='presencial' AND p.presencial_enabled=1)
               OR (f.mode='online' AND p.online_enabled=1))
        ORDER BY p.id LIMIT 101
    """, (org_id, service_id, mode)).fetchall()
    if len(rows) > MAX_PROFESSIONALS:
        raise ValueError("too_many_professionals")
    if not rows:
        raise LookupError("booking_selection_not_found")
    return rows


def candidates(c, org_id, professional_id, service_id, mode):
    if not isinstance(professional_id, str) or not 0 < len(professional_id) <= 70:
        raise ValueError("invalid_professional")
    eligible = eligible_professionals(c, org_id, service_id, mode)
    if professional_id == ANY_PROFESSIONAL:
        return eligible
    selected = [person for person in eligible if person["id"] == professional_id]
    if not selected:
        raise LookupError("booking_selection_not_found")
    return selected


def ranked_professionals(c, org_id, people, day, now=None):
    """Balance busy minutes (not booking count) for the selected date.

    A booking of 90 minutes adds twice the load of a 45-minute follow-up.
    Active 15-minute checkout holds and confirmed checkout bookings are also
    counted. The next seven days break ties; ID provides stable ordering.
    """
    if not people:
        return []
    from datetime import date, timedelta
    if isinstance(day, str):
        day = date.fromisoformat(day)
    if not isinstance(day, date):
        raise ValueError("invalid_date")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("invalid_now")
    epoch = int(now.timestamp())
    week_end = (day + timedelta(days=6)).isoformat()
    day_iso = day.isoformat()
    ranking = []
    for person in people:
        pid = person["id"]
        booking = c.execute("""
            SELECT COALESCE(SUM(CASE WHEN b.day=? THEN
                b.end_minute-b.start_minute ELSE 0 END),0) AS today_minutes,
              COALESCE(SUM(b.end_minute-b.start_minute),0) AS week_minutes
            FROM appt_bookings b
            WHERE b.org_id=? AND b.professional_id=? AND b.status='scheduled'
              AND b.day BETWEEN ? AND ?
        """, (day_iso, org_id, pid, day_iso, week_end)).fetchone()
        holds = c.execute("""
            SELECT COALESCE(SUM(CASE WHEN h.day=? THEN
                h.end_minute-h.start_minute ELSE 0 END),0) AS today_minutes,
              COALESCE(SUM(h.end_minute-h.start_minute),0) AS week_minutes
            FROM appt_checkout_holds h
            WHERE h.org_id=? AND h.professional_id=? AND h.day BETWEEN ? AND ?
              AND (h.status='confirmed' OR (h.status='held' AND h.expires_at>?))
        """, (day_iso, org_id, pid, day_iso, week_end, epoch)).fetchone()
        daily = int(booking["today_minutes"] or 0) + int(holds["today_minutes"] or 0)
        week = int(booking["week_minutes"] or 0) + int(holds["week_minutes"] or 0)
        ranking.append((daily, week, pid))
    ranking.sort()
    return [identifier for _, _, identifier in ranking]
