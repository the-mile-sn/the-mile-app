"""Recipient isolation tests with synthetic accounts, no live database."""
import sqlite3
import unittest
from notification_store_v2 import initialize
from notification_inbox_v2 import inbox, open_notification


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY)")
        self.c.executemany("INSERT INTO users VALUES(?)",[("admin",),("p",),("chef",)])
        initialize(self.c)
        self.p_id="a"*32
        self.chef_id="b"*32
        for nid,uid in ((self.p_id,"p"),(self.chef_id,"chef")):
            self.c.execute("""INSERT INTO v2_manual_notifications
                (id,request_id,recipient_id,sender_id,kind,language,title,body,created_at)
                VALUES(?,?,?,'admin','custom','pt-PT','Title','Body',100)""",(nid,nid,uid))

    def tearDown(self):
        self.c.close()

    def test_list_only_own_and_does_not_mark_read(self):
        self.assertEqual([r["id"] for r in inbox(self.c,"p")],[self.p_id])
        self.assertIsNone(inbox(self.c,"p")[0]["read_at"])
        self.assertEqual([r["id"] for r in inbox(self.c,"chef")],[self.chef_id])

    def test_open_cannot_cross_recipient(self):
        self.assertIsNone(open_notification(self.c,recipient_id="chef",notification_id=self.p_id,now=101))
        self.assertIsNone(inbox(self.c,"p")[0]["read_at"])

    def test_open_records_first_read_only(self):
        first=open_notification(self.c,recipient_id="p",notification_id=self.p_id,now=101)
        second=open_notification(self.c,recipient_id="p",notification_id=self.p_id,now=102)
        self.assertEqual(first["read_at"],101)
        self.assertEqual(second["read_at"],101)
        self.assertIsNone(inbox(self.c,"chef")[0]["read_at"])

    def test_invalid_id(self):
        self.assertIsNone(open_notification(self.c,recipient_id="p",notification_id="../bad",now=101))


if __name__=="__main__":
    unittest.main()
