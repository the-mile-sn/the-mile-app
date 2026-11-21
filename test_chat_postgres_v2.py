"""Chat backend contract against an ephemeral PostgreSQL server only."""
import os
import unittest
import chat_messaging_v2 as chat
try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg=None


class Adapter:
    def __init__(self,conn):self.conn=conn
    def execute(self,sql,params=()):
        return self.conn.execute(sql.replace("?","%s"),params)


@unittest.skipUnless(os.environ.get("CHAT_PG_TEST_DATABASE_URL") and psycopg,
                     "Disposable PostgreSQL not configured")
class ChatPostgresTests(unittest.TestCase):
    def test_idempotent_migration_and_staff_scoping(self):
        with psycopg.connect(os.environ["CHAT_PG_TEST_DATABASE_URL"],row_factory=dict_row) as raw:
            raw.execute("""CREATE TABLE users(
                id TEXT PRIMARY KEY,role TEXT NOT NULL,active INTEGER NOT NULL)""")
            raw.execute("""CREATE TABLE v2_athletes(
                id TEXT PRIMARY KEY,archived_at BIGINT)""")
            raw.execute("""CREATE TABLE v2_chef_links(
                user_id TEXT PRIMARY KEY REFERENCES users(id),
                athlete_id TEXT NOT NULL REFERENCES v2_athletes(id))""")
            raw.execute("INSERT INTO users VALUES('chef','chef',1),('staff','admin',1)")
            raw.execute("INSERT INTO v2_athletes VALUES('ath',NULL)")
            raw.execute("INSERT INTO v2_chef_links VALUES('chef','ath')")
            c=Adapter(raw)
            chat.initialize(c)
            chat.initialize(c)
            convo=chat.get_or_create_chef_conversation(c,'chef')
            chat.grant_staff_access(c,convo,'staff','staff')
            row,new=chat.send_message(c,convo,'chef','Teste','first')
            self.assertTrue(new)
            self.assertEqual(chat.unread_count(c,convo,'staff'),1)
            self.assertEqual(chat.list_messages(c,convo,'staff')[0]['id'],row['id'])
            self.assertTrue(chat.mark_read(c,convo,'staff',row['id']))
            self.assertEqual(chat.unread_count(c,convo,'staff'),0)
            raw.rollback()


if __name__=="__main__":unittest.main()
