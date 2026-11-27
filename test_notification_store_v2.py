import sqlite3
import unittest
from notification_store_v2 import initialize, mark_read, content_notified


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY)")
        self.c.executemany("INSERT INTO users VALUES(?)", [("admin",), ("player",), ("chef",)])
        initialize(self.c)
        initialize(self.c)

    def tearDown(self):
        self.c.close()

    def add(self, nid="n1", request="r1", recipient="player",
            kind="menu", target="week1", version="v1"):
        self.c.execute("""INSERT INTO v2_manual_notifications
            (id,request_id,recipient_id,sender_id,kind,language,title,body,
             target_id,content_version,created_at)
            VALUES(?,?,?,'admin',?,'pt-PT','Title','Body',?,?,100)""",
            (nid,request,recipient,kind,target,version))

    def test_recipient_only_read_and_first_time(self):
        self.add()
        self.assertFalse(mark_read(self.c, notification_id="n1", recipient_id="chef", now=101))
        self.assertTrue(mark_read(self.c, notification_id="n1", recipient_id="player", now=102))
        self.assertTrue(mark_read(self.c, notification_id="n1", recipient_id="player", now=103))
        self.assertEqual(self.c.execute("SELECT read_at,push_status FROM v2_manual_notifications").fetchone(),
                         (102,"not_attempted"))

    def test_content_version_unique_per_recipient(self):
        self.add()
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(nid="n2", request="r2")
        self.add(nid="n3", recipient="chef")
        self.add(nid="n4", request="r3", version="v2")
        self.assertTrue(content_notified(self.c, recipient_id="chef",kind="menu",
                                          target_id="week1",version="v1"))
        self.assertFalse(content_notified(self.c, recipient_id="chef",kind="menu",
                                           target_id="week1",version="v2"))

    def test_manual_retries_have_unique_request_but_allow_new_reminder(self):
        self.add(kind="game", target="match1", version=None)
        with self.assertRaises(sqlite3.IntegrityError):
            self.add(nid="n2", kind="game", target="match1", version=None)
        self.add(nid="n3", request="r2",kind="game",target="match1",version=None)


if __name__ == "__main__":
    unittest.main()
