from datetime import date, datetime, timedelta, timezone
import unittest
from notification_policy_v2 import weight_reminder_eligible


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


if __name__ == "__main__":
    unittest.main()
