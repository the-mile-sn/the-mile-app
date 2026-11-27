from dataclasses import replace
from datetime import datetime, timedelta, timezone
import unittest

from notification_content_policy_v2 import (
    ContentCandidate, content_version, suggested_content,
)


class ContentPolicyTests(unittest.TestCase):
    now = datetime(2026, 11, 27, 14, tzinfo=timezone.utc)
    item = ContentCandidate("assessment", "a1", "p1", "v1", True,
                            "new", now - timedelta(days=1))

    def select(self, items, notified=()):
        return suggested_content(items, notified_keys=notified,
                                 since=self.now - timedelta(days=7), now=self.now)

    def test_new_and_updated(self):
        updated = replace(self.item, version="v2", change_kind="updated")
        self.assertEqual(self.select([updated], [self.item.notification_key]), [updated])

    def test_same_version_already_notified(self):
        self.assertEqual(self.select([self.item], [self.item.notification_key]), [])

    def test_per_recipient_menu(self):
        player = replace(self.item, kind="menu")
        chef = replace(player, recipient_id="chef1")
        self.assertEqual(self.select([player, chef], [player.notification_key]), [chef])

    def test_exclude_unpublished_weekly_and_unknown(self):
        self.assertEqual(self.select([
            replace(self.item, visible=False),
            replace(self.item, kind="document", folder="weekly"),
            replace(self.item, change_kind=None),
            replace(self.item, changed_at=None),
            replace(self.item, kind="microcycle"),
        ]), [])

    def test_old_future_and_duplicates(self):
        self.assertEqual(self.select([
            replace(self.item, changed_at=self.now - timedelta(days=8)),
            replace(self.item, changed_at=self.now + timedelta(seconds=1)),
            self.item, self.item,
        ]), [self.item])

    def test_stable_content_hash(self):
        self.assertEqual(content_version({"a": 1, "b": 2}), content_version({"b": 2, "a": 1}))
        self.assertNotEqual(content_version({"a": 1}), content_version({"a": 2}))


if __name__ == "__main__":
    unittest.main()
