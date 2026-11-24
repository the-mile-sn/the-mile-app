"""Isolated Chat V1 domain tests: no production route, push or database access."""
import sqlite3
import unittest
import chat_messaging_v2 as chat


def db():
    c=sqlite3.connect(":memory:")
    c.row_factory=sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.executescript("""
        CREATE TABLE users(
          id TEXT PRIMARY KEY,role TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE v2_athletes(
          id TEXT PRIMARY KEY,archived_at BIGINT);
        CREATE TABLE v2_chef_links(
          user_id TEXT PRIMARY KEY REFERENCES users(id),
          athlete_id TEXT NOT NULL REFERENCES v2_athletes(id));
        INSERT INTO users VALUES
          ('chef-a','chef',1),('chef-b','chef',1),
          ('admin-a','admin',1),('admin-b','admin',1),
          ('inactive-admin','admin',0),('player-a','player',1);
        INSERT INTO v2_athletes VALUES ('a',NULL),('b',NULL);
        INSERT INTO v2_chef_links VALUES ('chef-a','a'),('chef-b','b');
    """)
    chat.initialize(c)
    chat.initialize_privacy_acknowledgements(c)
    return c


class ChatDomainTests(unittest.TestCase):
    def setUp(self):
        self.c=db()
        self.a=chat.get_or_create_chef_conversation(self.c,"chef-a")
        self.b=chat.get_or_create_chef_conversation(self.c,"chef-b")

    def tearDown(self):
        self.c.close()

    def test_additive_schema_idempotent_and_one_thread_per_chef(self):
        chat.initialize(self.c)
        self.assertEqual(self.a,chat.get_or_create_chef_conversation(self.c,"chef-a"))
        self.assertNotEqual(self.a,self.b)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_chat_conversations").fetchone()[0],2)

    def test_privacy_acknowledgement_is_explicit_versioned_and_per_chef(self):
        first=chat.privacy_notice_status(self.c,"chef-a")
        second=chat.privacy_notice_status(self.c,"chef-b")
        self.assertFalse(first["acknowledged"])
        self.assertFalse(second["acknowledged"])
        self.assertEqual(first["version"],chat.CHEF_PRIVACY_NOTICE_VERSION)
        self.assertIsNone(first["acknowledged_at"])
        with self.assertRaises(chat.ChatAccessError):
            chat.require_privacy_notice(self.c,"chef-a")
        with self.assertRaises(ValueError):
            chat.acknowledge_privacy_notice(self.c,"chef-a","wrong-version")
        with self.assertRaises(chat.ChatAccessError):
            chat.acknowledge_privacy_notice(self.c,"admin-a",chat.CHEF_PRIVACY_NOTICE_VERSION)
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_privacy_acknowledgements").fetchone()[0],0)
        accepted=chat.acknowledge_privacy_notice(self.c,"chef-a",chat.CHEF_PRIVACY_NOTICE_VERSION)
        self.assertTrue(accepted["acknowledged"])
        self.assertIsInstance(accepted["acknowledged_at"],int)
        repeat=chat.acknowledge_privacy_notice(self.c,"chef-a",chat.CHEF_PRIVACY_NOTICE_VERSION)
        self.assertEqual(repeat,accepted)
        self.assertEqual(chat.privacy_notice_status(self.c,"chef-a"),accepted)
        self.assertFalse(chat.privacy_notice_status(self.c,"chef-b")["acknowledged"])
        chat.require_privacy_notice(self.c,"chef-a")
        with self.assertRaises(chat.ChatAccessError):
            chat.require_privacy_notice(self.c,"chef-b")
        # Re-running the additive migration never erases an acknowledgement.
        chat.initialize_privacy_acknowledgements(self.c)
        self.assertEqual(chat.privacy_notice_status(self.c,"chef-a"),accepted)
        # A newer notice version can require the Chef to acknowledge again.
        old=chat.CHEF_PRIVACY_NOTICE_VERSION
        try:
            chat.CHEF_PRIVACY_NOTICE_VERSION="chef-chat-privacy-new-version"
            self.assertFalse(chat.privacy_notice_status(self.c,"chef-a")["acknowledged"])
        finally:
            chat.CHEF_PRIVACY_NOTICE_VERSION=old
        self.assertTrue(chat.privacy_notice_status(self.c,"chef-a")["acknowledged"])

    def test_cannot_infer_another_chef_or_access_foreign_messages(self):
        for function in (
            lambda:chat.list_messages(self.c,self.b,"chef-a"),
            lambda:chat.send_message(self.c,self.b,"chef-a","Olá","scope-1"),
            lambda:chat.unread_count(self.c,self.b,"chef-a"),
            lambda:chat.list_messages(self.c,self.a,"admin-a"),
            lambda:chat.list_messages(self.c,self.a,"player-a"),
        ):
            with self.assertRaises(chat.ChatAccessError):
                function()

    def test_explicit_staff_access_and_revocation(self):
        with self.assertRaises(chat.ChatAccessError):
            chat.grant_staff_access(self.c,self.a,"chef-b","admin-a")
        with self.assertRaises(chat.ChatAccessError):
            chat.grant_staff_access(self.c,self.a,"admin-a","inactive-admin")
        chat.grant_staff_access(self.c,self.a,"admin-a","admin-b")
        self.assertEqual(len(chat.list_staff_conversations(self.c,"admin-b")),1)
        chat.revoke_staff_access(self.c,self.a,"admin-a","admin-b")
        with self.assertRaises(chat.ChatAccessError):
            chat.list_messages(self.c,self.a,"admin-b")
        self.assertEqual(chat.list_staff_conversations(self.c,"admin-b"),[])

    def test_send_idempotency_order_and_unread_per_member(self):
        chat.grant_staff_access(self.c,self.a,"admin-a","admin-a")
        first,created=chat.send_message(self.c,self.a,"chef-a","Olá","client-one")
        self.assertTrue(created)
        repeat,created=chat.send_message(self.c,self.a,"chef-a","Diferente","client-one")
        self.assertFalse(created)
        self.assertEqual(repeat["id"],first["id"])
        self.assertEqual(repeat["body"],"Olá")
        second,created=chat.send_message(self.c,self.a,"admin-a","Resposta","client-two")
        self.assertTrue(created)
        self.assertEqual(chat.unread_count(self.c,self.a,"admin-a"),1)
        self.assertEqual(chat.unread_count(self.c,self.a,"chef-a"),1)
        self.assertEqual(len(chat.list_messages(self.c,self.a,"chef-a")),2)
        self.assertGreater(second["created_at"],first["created_at"])
        self.assertEqual(len(chat.list_messages(self.c,self.a,"chef-a",after_id=first["id"])),1)
        self.assertTrue(chat.mark_read(self.c,self.a,"chef-a",second["id"]))
        self.assertFalse(chat.mark_read(self.c,self.a,"chef-a",second["id"]))
        self.assertEqual(chat.unread_count(self.c,self.a,"chef-a"),0)
        self.assertEqual(chat.unread_count(self.c,self.a,"admin-a"),1)
        self.assertTrue(chat.mark_read(self.c,self.a,"admin-a",first["id"]))
        self.assertEqual(chat.unread_count(self.c,self.a,"admin-a"),0)
        with self.assertRaises(ValueError):
            chat.mark_read(self.c,self.a,"chef-a","nonexistent")
        with self.assertRaises(ValueError):
            chat.list_messages(self.c,self.a,"chef-a",after_id="other")

    def test_validation_roles_and_archived_athlete(self):
        for value in (" ","x"*2001,"bad\x00control"):
            with self.assertRaises(ValueError):
                chat.send_message(self.c,self.a,"chef-a",value,"unique")
        for key in ("","x"*97,"contains space"):
            with self.assertRaises(ValueError):
                chat.send_message(self.c,self.a,"chef-a","Hi",key)
        with self.assertRaises(ValueError):
            chat.list_messages(self.c,self.a,"chef-a",limit=101)
        self.c.execute("UPDATE v2_athletes SET archived_at=123 WHERE id='a'")
        with self.assertRaises(chat.ChatAccessError):
            chat.send_message(self.c,self.a,"chef-a","Olá","key")
        with self.assertRaises(chat.ChatAccessError):
            chat.get_or_create_chef_conversation(self.c,"chef-a")

    def test_retention_uses_12_utc_calendar_months_and_no_purge(self):
        from datetime import datetime, timezone
        stamp=lambda y,m,d: int(datetime(y,m,d,tzinfo=timezone.utc).timestamp()*1000)
        self.assertEqual(
            chat.retention_review_timestamp(stamp(2026,11,21)),
            stamp(2027,11,21))
        self.assertEqual(
            chat.retention_review_timestamp(stamp(2024,2,29)),
            stamp(2025,2,28))
        for invalid in (-1,True,"2026-11-21"):
            with self.assertRaises(ValueError):
                chat.retention_review_timestamp(invalid)

        # An unassigned administrator cannot close a Chef's conversation.
        with self.assertRaises(chat.ChatAccessError):
            chat.archive_conversation(self.c,self.a,"admin-a",stamp(2026,11,21))
        with self.assertRaises(chat.ChatAccessError):
            chat.archive_conversation(self.c,self.a,"chef-a",stamp(2026,11,21))
        chat.grant_staff_access(self.c,self.a,"admin-a","admin-a")
        original,_=chat.send_message(self.c,self.a,"chef-a","Histórico","retention-1")
        status=chat.archive_conversation(self.c,self.a,"admin-a",stamp(2026,11,21))
        self.assertEqual(status["closed_at"],stamp(2026,11,21))
        self.assertEqual(status["retention_review_at"],stamp(2027,11,21))
        # Repeating an archival request must not silently extend retention.
        repeated=chat.archive_conversation(self.c,self.a,"admin-a",stamp(2027,1,1))
        self.assertEqual(repeated,status)
        with self.assertRaises(chat.ChatAccessError):
            chat.send_message(self.c,self.a,"chef-a","Novo","retention-2")
        self.assertEqual(
            chat.list_messages(self.c,self.a,"chef-a")[0]["id"],original["id"])
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_chat_messages").fetchone()[0],1)

    def test_no_implicit_admin_access_or_cross_staff_inbox(self):
        self.assertEqual(chat.list_staff_conversations(self.c,"admin-a"),[])
        chat.grant_staff_access(self.c,self.a,"admin-a","admin-a")
        self.assertEqual(len(chat.list_staff_conversations(self.c,"admin-a")),1)
        self.assertEqual(chat.list_staff_conversations(self.c,"admin-b"),[])


if __name__=="__main__":
    unittest.main()
