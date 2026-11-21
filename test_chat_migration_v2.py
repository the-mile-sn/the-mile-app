"""Migration safety checks against a disposable, local PostgreSQL instance.

Never run these tests against production. CI provides CHAT_PG_TEST_DATABASE_URL
pointing to its throwaway Postgres service on localhost.
"""
import os
import unittest
from unittest.mock import patch
from urllib.parse import urlparse

import psycopg

import migrate_chat_schema_v2 as migration


@unittest.skipUnless(os.environ.get("CHAT_PG_TEST_DATABASE_URL"),
                     "Disposable PostgreSQL not configured")
class MigrationSafetyTests(unittest.TestCase):
    def setUp(self):
        self.url = os.environ["CHAT_PG_TEST_DATABASE_URL"]
        p = urlparse(self.url)
        if p.hostname not in ("localhost", "127.0.0.1") or p.path != "/chat_test":
            raise RuntimeError("Refusing non-local or non-disposable migration tests")
        with psycopg.connect(self.url) as c:
            c.execute("DROP TABLE IF EXISTS v2_chat_read_state CASCADE")
            c.execute("DROP TABLE IF EXISTS v2_chat_messages CASCADE")
            c.execute("DROP TABLE IF EXISTS v2_chat_memberships CASCADE")
            c.execute("DROP TABLE IF EXISTS v2_chat_conversations CASCADE")
            c.execute("DROP TABLE IF EXISTS v2_chef_links CASCADE")
            c.execute("DROP TABLE IF EXISTS v2_athletes CASCADE")
            c.execute("DROP TABLE IF EXISTS users CASCADE")
            c.execute("CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT, active INTEGER)")
            c.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY, archived_at BIGINT)")
            c.execute("""CREATE TABLE v2_chef_links(
                user_id TEXT REFERENCES users(id),
                athlete_id TEXT REFERENCES v2_athletes(id))""")

    def tearDown(self):
        with psycopg.connect(self.url) as c:
            for table in (migration.CHAT_TABLES[::-1] +
                          ("v2_chef_links", "v2_athletes", "users")):
                c.execute('DROP TABLE IF EXISTS "' + table + '" CASCADE')

    def run_migration(self, *flags, expected_db="chat_test"):
        with patch.dict(os.environ, {"DATABASE_URL":self.url}):
            with patch.object(migration, "EXPECTED_DATABASE", expected_db):
                return migration.main(list(flags))

    def chat_tables(self):
        with psycopg.connect(self.url) as c:
            return {row[0] for row in c.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='public' AND table_name LIKE 'v2_chat_%'
            """)}

    def test_default_is_read_only_and_apply_creates_empty_schema(self):
        self.assertEqual(self.run_migration(), 0)
        self.assertEqual(self.chat_tables(), set())
        self.assertEqual(self.run_migration("--apply", "--backup-confirmed"), 0)
        self.assertEqual(self.chat_tables(), set(migration.CHAT_TABLES))
        with psycopg.connect(self.url) as c:
            for table in migration.CHAT_TABLES:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM "' + table + '"').fetchone()[0], 0)
            self.assertEqual({row[0] for row in c.execute("""
                SELECT indexname FROM pg_indexes
                WHERE schemaname='public' AND indexname = ANY(%s)
            """, (list(migration.CHAT_INDEXES),))}, set(migration.CHAT_INDEXES))
        with self.assertRaisesRegex(RuntimeError, "already exists"):
            self.run_migration("--apply", "--backup-confirmed")
        self.assertEqual(self.chat_tables(), set(migration.CHAT_TABLES))

    def test_refuses_wrong_database_without_changes(self):
        with self.assertRaisesRegex(RuntimeError, "Wrong database"):
            self.run_migration("--apply", "--backup-confirmed", expected_db="the_mile_db")
        self.assertEqual(self.chat_tables(), set())

    def test_refuses_partial_schema_without_changes(self):
        with psycopg.connect(self.url) as c:
            c.execute("CREATE TABLE v2_chat_conversations(id TEXT PRIMARY KEY)")
        with self.assertRaisesRegex(RuntimeError, "partially present"):
            self.run_migration("--apply", "--backup-confirmed")
        self.assertEqual(self.chat_tables(), {"v2_chat_conversations"})

    def test_refuses_missing_dependencies_without_changes(self):
        with psycopg.connect(self.url) as c:
            c.execute("DROP TABLE v2_chef_links")
        with self.assertRaisesRegex(RuntimeError, "Missing application prerequisites"):
            self.run_migration("--apply", "--backup-confirmed")
        self.assertEqual(self.chat_tables(), set())

    def test_requires_explicit_backup_confirmation(self):
        with self.assertRaises(SystemExit) as exc:
            self.run_migration("--apply")
        self.assertEqual(exc.exception.code, 2)
        self.assertEqual(self.chat_tables(), set())


if __name__ == "__main__":
    unittest.main()
