"""Admin preview regression tests against synthetic data only."""
import unittest
import test_notification_sources_v2 as fixtures
from notification_admin_preview_v2 import preview


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.SourceTests()
        self.fixture.setUp()
        self.c = self.fixture.c
        self.now = self.fixture.now

    def tearDown(self):
        self.fixture.tearDown()

    def query(self, kind, scope=("a",)):
        return preview(self.c, authorised_athlete_ids=scope, kind=kind, now=self.now)["items"]

    def test_preview_is_read_only(self):
        before = self.c.total_changes
        for kind in ("game", "weight", "document", "assessment", "menu", "custom", "history"):
            self.query(kind)
        self.assertEqual(self.c.total_changes, before)

    def test_menu_is_grouped_per_week_and_recipient(self):
        items = self.query("menu")
        self.assertEqual({i["recipient_id"] for i in items}, {"p","chef"})
        self.assertEqual(len({i["target_id"] for i in items}), 1)
        self.assertEqual(len({i["version"] for i in items}), 1)

    def test_history_excludes_other_athletes_and_preserves_read_state(self):
        for nid, uid, read in (("one","p",101),("two","q",None),("three","chef",None)):
            self.c.execute("""INSERT INTO v2_manual_notifications
                (id,request_id,recipient_id,sender_id,kind,language,title,body,created_at,read_at)
                VALUES(?,?,?,'admin','custom','pt-PT','Title','Body',100,?)""",
                (nid,nid,uid,read))
        rows = {i["recipient_id"]:i for i in self.query("history")}
        self.assertEqual(set(rows), {"p","chef"})
        self.assertEqual(rows["p"]["read_at"],101)
        self.assertIsNone(rows["chef"]["read_at"])

    def test_invalid_kind_and_empty_scope(self):
        with self.assertRaises(ValueError):
            self.query("invalid")
        self.assertEqual(self.query("custom",scope=()),[])


if __name__ == "__main__":
    unittest.main()
