"""Pure eligibility policy for manually initiated v2 weight reminders.

No database access, scheduling, sending, or application startup hooks.
Callers must resolve authorised, active follow-up recipients and supply
the latest valid weigh-in date and latest v2 weight reminder timestamp.
"""
from datetime import date, datetime, timedelta, timezone

WEIGHT_REMINDER_INTERVAL = timedelta(days=3)


def weight_reminder_eligible(*, active: bool, last_weigh_date: date | None,
                             last_reminder_at: datetime | None,
                             now: datetime) -> bool:
    """Use the caller's local calendar date for weigh-ins and 72h for cooldown."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if last_reminder_at is not None and (
        last_reminder_at.tzinfo is None or last_reminder_at.utcoffset() is None
    ):
        raise ValueError("last_reminder_at must be timezone-aware")
    if not active:
        return False
    if last_weigh_date is not None and now.date() - last_weigh_date < WEIGHT_REMINDER_INTERVAL:
        return False
    if last_reminder_at is not None:
        elapsed = now.astimezone(timezone.utc) - last_reminder_at.astimezone(timezone.utc)
        if elapsed < WEIGHT_REMINDER_INTERVAL:
            return False
    return True
