"""Review-only migration verification on disposable localhost PostgreSQL.

Never connects to Render. Every test makes an isolated schema and drops it.
"""
import os
from pathlib import Path
import tools.i18n_preflight_readonly as preflight
import secrets
import unittest
from urllib.parse import urlparse

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None

SQL = Path(__file__).resolve().parent / "sql/i18n/02_translation_backoffice_additive_review.sql"


@unittest.skipUnless(os.environ.get("TRANSLATION_TEST_DATABASE_URL"), "No local CI DB")
class TranslationMigrationSQLTests(unittest.TestCase):
    def setUp(self):
        if psycopg is None:
            self.fail("Install psycopg only in the disposable PostgreSQL CI job")
        url = os.environ["TRANSLATION_TEST_DATABASE_URL"]
        parsed = urlparse(url)
        if parsed.hostname not in ("127.0.0.1", "localhost") or parsed.path != "/the_mile_i18n_ci":
            self.fail("Unsafe target; only the local the_mile_i18n_ci database is allowed")
        self.schema = "i18n_migration_ci_" + secrets.token_hex(7)
        self.conn = psycopg.connect(url, autocommit=True, row_factory=dict_row)
        self.conn.execute("CREATE SCHEMA " + self.schema)
        self.conn.execute("SET search_path TO " + self.schema)
        self.sql = SQL.read_text(encoding="utf-8")

    def tearDown(self):
        try:
            self.conn.execute("ROLLBACK")
            self.conn.execute("SET search_path TO public")
            self.conn.execute("DROP SCHEMA " + self.schema + " CASCADE")
        finally:
            self.conn.close()

    def originals(self):
        self.conn.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
        self.conn.execute("""CREATE TABLE v2_food_library (
            id TEXT PRIMARY KEY, display_name TEXT, active INT)""")
        self.conn.execute("""CREATE TABLE v2_dish_library (
            id TEXT PRIMARY KEY, name_pt TEXT, name_en TEXT, active INT)""")
        self.conn.execute("INSERT INTO users VALUES ('admin')")
        self.conn.execute("INSERT INTO v2_food_library VALUES ('f','Arroz',1)")
        self.conn.execute("INSERT INTO v2_dish_library VALUES ('d','Frango','Chicken',1)")

    def test_additive_and_idempotent_without_moving_source(self):
        self.originals()
        first = self.conn.execute("SELECT display_name FROM v2_food_library").fetchone()
        other = self.conn.execute("SELECT name_pt,name_en FROM v2_dish_library").fetchone()
        self.conn.execute(self.sql)
        self.conn.execute(self.sql)
        self.assertEqual(first, self.conn.execute("SELECT display_name FROM v2_food_library").fetchone())
        self.assertEqual(other, self.conn.execute("SELECT name_pt,name_en FROM v2_dish_library").fetchone())
        self.assertEqual(self.conn.execute("SELECT COUNT(*) AS n FROM v2_content_translations").fetchone()["n"],0)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) AS n FROM v2_content_translation_history").fetchone()["n"],0)
        indexes = {r["indexname"] for r in self.conn.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()").fetchall()}
        self.assertIn("v2_content_translations_review", indexes)
        self.assertIn("v2_content_translation_history_lookup", indexes)

    def test_migration_does_not_create_missing_originals(self):
        with self.assertRaises(psycopg.Error):
            self.conn.execute(self.sql)
        self.conn.execute("ROLLBACK")
        self.assertIsNone(self.conn.execute("SELECT to_regclass('v2_content_translations') AS v").fetchone()["v"])
        self.assertIsNone(self.conn.execute("SELECT to_regclass('users') AS v").fetchone()["v"])

    def test_schema_conflict_rolls_back_without_dropping_data(self):
        self.originals()
        self.conn.execute("CREATE TABLE v2_content_translations (entity_kind TEXT)")
        self.conn.execute("INSERT INTO v2_content_translations VALUES ('historical')")
        with self.assertRaises(psycopg.Error):
            self.conn.execute(self.sql)
        self.conn.execute("ROLLBACK")
        self.assertEqual(self.conn.execute(
            "SELECT entity_kind FROM v2_content_translations").fetchone()["entity_kind"], "historical")
        self.assertIsNone(self.conn.execute(
            "SELECT to_regclass('v2_content_translation_history') AS v").fetchone()["v"])
        self.assertEqual(self.conn.execute(
            "SELECT display_name FROM v2_food_library").fetchone()["display_name"],"Arroz")


    def test_readonly_preflight_reports_only_schema_and_counts(self):
        from psycopg.rows import tuple_row
        self.originals()
        self.conn.execute("ALTER TABLE v2_food_library ADD COLUMN notes TEXT DEFAULT ''")
        self.conn.execute("ALTER TABLE v2_food_library ADD COLUMN category TEXT DEFAULT 'Cereais'")
        self.conn.execute("ALTER TABLE v2_dish_library ADD COLUMN category TEXT DEFAULT 'Carne'")
        with self.conn.cursor(row_factory=tuple_row) as c:
            c.execute("BEGIN READ ONLY")
            try:
                result = preflight.audit(c)
                self.assertTrue(result["read_only"])
                self.assertTrue(result["source_schema_compatible"])
                self.assertEqual(result["coverage"]["active_foods"], 1)
                self.assertEqual(result["coverage"]["active_dishes"], 1)
                self.assertEqual(result["coverage"]["dish_legacy_english_candidates"], 1)
                self.assertFalse(result["existing_tables"]["v2_content_translations"])
                self.assertFalse(result["backup_restore_verified"])
                self.assertFalse(result["production_migration_performed"])
                self.assertNotIn("Arroz", str(result))
                self.assertNotIn("Chicken", str(result))
            finally:
                c.execute("ROLLBACK")

    def test_readonly_preflight_refuses_writable_sessions(self):
        from psycopg.rows import tuple_row
        self.originals()
        with self.conn.cursor(row_factory=tuple_row) as c:
            with self.assertRaisesRegex(RuntimeError, "preflight_must_use_read_only"):
                preflight.audit(c)

    def test_readonly_preflight_detects_source_schema_missing(self):
        from psycopg.rows import tuple_row
        with self.conn.cursor(row_factory=tuple_row) as c:
            c.execute("BEGIN READ ONLY")
            try:
                result = preflight.audit(c)
                self.assertFalse(result["source_schema_compatible"])
                self.assertIn("required_table_missing:v2_food_library",
                              result["preflight_issues"])
                self.assertEqual(result["coverage"], {})
            finally:
                c.execute("ROLLBACK")


if __name__ == "__main__":
    unittest.main()
