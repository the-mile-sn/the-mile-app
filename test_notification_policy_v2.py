from datetime import date, datetime, timedelta, timezone
import unittest
from notification_policy_v2 import weight_reminder_eligible, latest_pending_match


class WeightReminderPolicyTests(unittest.TestCase):
    now = datetime(2026, 11, 27, 14, tzinfo=timezone.utc)

    def eligible(self, weight=None, reminder=None, active=True):
        return weight_reminder_eligible(active=active, last_weigh_date=weight,
                                        last_reminder_at=reminder, now=self.now)

    def test_recent_weight(self):
        for days in (0, 1, 2):
            with self.subTest(days=days):
                self.assertFalse(self.eligible(self.now.date() - timedelta(days=days)))

    def test_three_days_or_more(self):
        for days in (3, 5, 7):
            with self.subTest(days=days):
                self.assertTrue(self.eligible(self.now.date() - timedelta(days=days)))

    def test_no_record_and_active(self):
        self.assertTrue(self.eligible())
        self.assertFalse(self.eligible(active=False))

    def test_reminder_cooldown(self):
        weight = date(2026, 11, 22)
        self.assertFalse(self.eligible(weight, self.now - timedelta(days=1)))
        self.assertFalse(self.eligible(weight, self.now - timedelta(hours=71, minutes=59)))
        self.assertTrue(self.eligible(weight, self.now - timedelta(hours=72)))

    def test_new_weight_overrides_previous_eligibility(self):
        self.assertFalse(self.eligible(self.now.date(), self.now - timedelta(days=4)))

    def test_future_dates_fail_closed(self):
        self.assertFalse(self.eligible(self.now.date() + timedelta(days=1)))
        self.assertFalse(self.eligible(reminder=self.now + timedelta(hours=1)))

    def test_naive_timestamp_rejected(self):
        with self.assertRaises(ValueError):
            self.eligible(reminder=self.now.replace(tzinfo=None))


class MatchReminderPolicyTests(unittest.TestCase):
    today = date(2026, 11, 27)
    matches = [
        {"id": "older", "match_date": "2026-11-21"},
        {"id": "latest", "match_date": "2026-11-25"},
        {"id": "today", "match_date": "2026-11-27"},
        {"id": "future", "match_date": "2026-11-29"},
    ]

    def select(self, answered=(), active=True, matches=None):
        return latest_pending_match(active=active,
                                    matches=self.matches if matches is None else matches,
                                    answered_match_ids=answered, local_day=self.today)

    def test_latest_only(self):
        self.assertEqual(self.select(), "latest")

    def test_no_fallback_when_latest_answered(self):
        self.assertIsNone(self.select(answered=("latest",)))

    def test_older_answer_does_not_hide_latest(self):
        self.assertEqual(self.select(answered=("older",)), "latest")

    def test_no_today_or_future_only(self):
        self.assertIsNone(self.select(matches=self.matches[2:]))

    def test_window_and_inactive(self):
        self.assertIsNone(self.select(active=False))
        self.assertIsNone(self.select(matches=[{"id": "old", "match_date": "2026-10-27"}]))
        self.assertEqual(self.select(matches=[{"id": "edge", "match_date": "2026-10-28"}]), "edge")


if __name__ == "__main__":
    unittest.main()
