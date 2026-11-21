"""PostgreSQL compatibility test on a LOCAL, disposable CI database only.

Never runs against Render. Requires the exact ephemeral CI database name.
All objects are placed in a newly created temporary schema and dropped.
"""
import os
import secrets
import unittest
from urllib.parse import urlparse

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None

import content_translations_v2 as translations
import app_language_preferences_v2 as preferences
import app_translation_admin_v2 as admin_api
import app_translation_catalog_v2 as catalog


class CompatConnection:
    """Match the existing app.PgConnection '?' placeholder behavior."""
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=()):
        return self.conn.execute(sql.replace("?", "%s"), params)


@unittest.skipUnless(
    os.environ.get("TRANSLATION_TEST_DATABASE_URL"), "No ephemeral PG URL")
class PostgresCompatibilityTests(unittest.TestCase):
    def test_additive_schema_and_review_round_trip(self):
        if psycopg is None:
            self.fail("psycopg is required for the PostgreSQL compatibility job")
        url = os.environ["TRANSLATION_TEST_DATABASE_URL"]
        parsed = urlparse(url)
        if (parsed.hostname not in ("127.0.0.1", "localhost")
                or parsed.path != "/the_mile_i18n_ci"):
            self.fail("Unsafe PostgreSQL target: requires LOCAL ephemeral CI database")
        schema = "translation_ci_" + secrets.token_hex(7)
        with psycopg.connect(url, autocommit=True, row_factory=dict_row) as conn:
            conn.execute("CREATE SCHEMA " + schema)
            try:
                conn.execute("SET search_path TO " + schema)
                c = CompatConnection(conn)
                c.execute("CREATE TABLE users (id TEXT PRIMARY KEY,role TEXT,active INTEGER)")
                c.execute("INSERT INTO users VALUES ('admin','admin',1),('player','player',1),('chef','chef',1)")
                c.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY,archived_at BIGINT)")
                c.execute("INSERT INTO v2_athletes VALUES ('athlete',NULL)")
                c.execute("""CREATE TABLE v2_chef_links (
                    user_id TEXT PRIMARY KEY, athlete_id TEXT,
                    language TEXT, archived_at BIGINT)""")
                c.execute("INSERT INTO v2_chef_links VALUES ('chef','athlete','pt',NULL)")
                c.execute("""CREATE TABLE v2_food_library (
                    id TEXT PRIMARY KEY, display_name TEXT,
                    notes TEXT, category TEXT, active INTEGER)""")
                c.execute("INSERT INTO v2_food_library VALUES ('f1','Arroz','','Cereais',1)")
                c.execute("""CREATE TABLE v2_dish_library (
                    id TEXT PRIMARY KEY, name_pt TEXT, name_en TEXT,
                    category TEXT, active INTEGER)""")
                c.execute("INSERT INTO v2_dish_library VALUES ('d1','Peixe','Fish','Peixe',1)")
                translations.initialize(c)
                translations.initialize(c)
                preferences.initialize(c)
                preferences.initialize(c)
                actor = {"id": "admin", "role": "admin"}
                review = admin_api.inspect(c, actor, entity_kind="food",
                                           entity_id="f1", field_path="display_name")
                result = admin_api.propose(c, actor, {
                    "entity_kind": "food", "entity_id": "f1",
                    "field_path": "display_name", "language": "en",
                    "expected_source_hash": review["source_hash"],
                    "translated_text": "Rice"})
                self.assertEqual(result["status"], "pending")
                again = admin_api.inspect(c, actor, entity_kind="food",
                                          entity_id="f1", field_path="display_name")
                approved = admin_api.approve(c, actor, {
                    "entity_kind": "food", "entity_id": "f1",
                    "field_path": "display_name", "language": "en",
                    "expected_source_hash": review["source_hash"],
                    "expected_candidate_hash": again["candidate"]["candidate_hash"]})
                self.assertEqual(approved["status"], "approved")
                live = admin_api.inspect(c, actor, entity_kind="food",
                                         entity_id="f1", field_path="display_name")
                self.assertEqual(live["effective"]["text"], "Rice")
                overview = catalog.overview(c, actor)
                groups = {g["kind"]: g for g in overview["libraries"]}
                self.assertEqual(groups["food"]["statuses"]["approved"], 1)
                self.assertEqual(groups["dish"]["statuses"]["legacy_review"], 1)
                self.assertIsNone(groups["recipe"]["record_count"])
                legacy = catalog.list_fields(c, actor, entity_kind="dish", status="legacy_review")
                self.assertEqual(legacy["total"], 1)
                self.assertEqual(legacy["items"][0]["legacy_candidate"], "Fish")
                self.assertEqual(c.execute(
                    "SELECT display_name FROM v2_food_library WHERE id='f1'"
                ).fetchone()["display_name"], "Arroz")
                player = {"id": "player", "role": "player"}
                self.assertEqual(preferences.read(c, player)["language"], "pt")
                self.assertEqual(preferences.save(c, player, "en")["language"], "en")
                self.assertEqual(preferences.read(c, player)["language"], "en")
                chef = {"id": "chef", "role": "chef"}
                self.assertEqual(preferences.read(c, chef)["language"], "pt")
                with self.assertRaisesRegex(ValueError, "use_existing_chef_preferences_endpoint"):
                    preferences.save(c, chef, "en")
                self.assertEqual(c.execute(
                    "SELECT language FROM v2_chef_links WHERE user_id='chef'"
                ).fetchone()["language"], "pt")
            finally:
                conn.execute("SET search_path TO public")
                conn.execute("DROP SCHEMA " + schema + " CASCADE")


if __name__ == "__main__":
    unittest.main()
