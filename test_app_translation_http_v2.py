"""Integration-level contract of gated PT/EN routes, without live app/Render.

All input records and sessions are disposable SQLite fixtures. app.py still
owns cookie authentication, role segregation, origin and CSRF gates.
"""
import hashlib
import pathlib
import sqlite3
import unittest

import app_translation_http_v2 as http
import app_language_preferences_v2 as preferences
import content_translations_v2 as translations


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class TranslationHTTPTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("""CREATE TABLE users
            (id TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL)""")
        self.c.executemany("INSERT INTO users VALUES (?,?,?)", (
            ("adm", "admin", 1), ("disabled", "admin", 0),
            ("player-a", "player", 1), ("player-b", "player", 1),
            ("chef-a", "chef", 1),
        ))
        self.c.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, archived_at BIGINT)")
        self.c.execute("INSERT INTO v2_athletes VALUES ('a',NULL)")
        self.c.execute("""CREATE TABLE v2_chef_links
            (user_id TEXT PRIMARY KEY, athlete_id TEXT,
             language TEXT, archived_at BIGINT)""")
        self.c.execute("INSERT INTO v2_chef_links VALUES ('chef-a','a','en',NULL)")
        self.c.execute("""CREATE TABLE v2_food_library
            (id TEXT PRIMARY KEY,display_name TEXT,notes TEXT,active INTEGER)""")
        self.c.execute("INSERT INTO v2_food_library VALUES ('f','Arroz branco','Pesar cozido',1)")
        self.c.execute("""CREATE TABLE v2_dish_library
            (id TEXT PRIMARY KEY,name_pt TEXT,active INTEGER)""")
        self.c.execute("INSERT INTO v2_dish_library VALUES ('d','Peixe grelhado',1)")
        translations.initialize(self.c)
        preferences.initialize(self.c)
        self.admin = {"id": "adm", "role": "admin"}
        self.a = {"id": "player-a", "role": "player"}
        self.b = {"id": "player-b", "role": "player"}
        self.chef = {"id": "chef-a", "role": "chef"}

    def tearDown(self):
        self.c.close()

    def call(self, path, method="GET", user=None, site_role="both",
             query=None, body=None):
        return http.dispatch(self.c, site_role=site_role, user=user,
                             path=path, method=method, query=query, body=body)

    def inspect(self, user=None):
        return self.call(http.ADMIN_ROOT, user=user or self.admin,
                         query={"entity_kind": ["food"], "entity_id": ["f"],
                                "field_path": ["display_name"]})[1]

    def proposal(self, original_hash, text="White rice"):
        return {"entity_kind": "food", "entity_id": "f",
                "field_path": "display_name", "language": "en",
                "expected_source_hash": original_hash,
                "translated_text": text}

    def approval(self, original_hash, candidate_hash):
        return {"entity_kind": "food", "entity_id": "f",
                "field_path": "display_name", "language": "en",
                "expected_source_hash": original_hash,
                "expected_candidate_hash": candidate_hash}

    def test_new_route_allowlist_excludes_current_chef_endpoint(self):
        self.assertNotIn("/api/v2/chef/preferences", http.ALLOWED)
        with self.assertRaises(http.APIError) as caught:
            self.call("/api/v2/chef/preferences", user=self.chef)
        self.assertEqual(caught.exception.status, 404)

    def test_player_language_defaults_pt_and_persists_on_self(self):
        code, body = self.call(http.PLAYER_LANGUAGE, user=self.a)
        self.assertEqual((code, body["language"]), (200, "pt"))
        status, data = self.call(
            http.PLAYER_LANGUAGE, "PUT", self.a, body={"language": "en"})
        self.assertEqual((status, data["language"]), (200, "en"))
        self.assertEqual(self.call(http.PLAYER_LANGUAGE, user=self.a)[1]["language"], "en")
        self.assertEqual(self.call(http.PLAYER_LANGUAGE, user=self.b)[1]["language"], "pt")
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_player_language_preferences").fetchone()[0], 1)

    def test_player_language_ignores_client_user_id(self):
        with self.assertRaises(http.APIError) as caught:
            self.call(http.PLAYER_LANGUAGE, "PUT", self.a,
                      body={"language": "en", "user_id": "player-b"})
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(self.call(http.PLAYER_LANGUAGE, user=self.b)[1]["language"], "pt")

    def test_player_language_rejects_invalid_locale(self):
        with self.assertRaises(http.APIError) as caught:
            self.call(http.PLAYER_LANGUAGE, "PUT", self.a, body={"language": "es"})
        self.assertEqual((caught.exception.status, caught.exception.code),
                         (400, "invalid_language"))

    def test_role_and_service_isolation(self):
        cases = [
            (http.PLAYER_LANGUAGE, self.admin, "admin"),
            (http.PLAYER_LANGUAGE, self.chef, "both"),
            (http.CHEF_LANGUAGE, self.a, "both"),
            (http.ADMIN_ROOT, self.a, "both"),
            (http.ADMIN_ROOT, self.admin, "player"),
        ]
        for route, actor, site in cases:
            with self.subTest(route=route, role=actor["role"], site=site):
                with self.assertRaises(http.APIError) as caught:
                    self.call(route, user=actor, site_role=site)
                self.assertIn(caught.exception.status, (403, 404))

    def test_anonymous_and_disabled_sessions_denied(self):
        with self.assertRaises(http.APIError) as caught:
            self.call(http.PLAYER_LANGUAGE)
        self.assertEqual(caught.exception.status, 401)
        with self.assertRaises(http.APIError) as caught:
            self.inspect(user={"id": "disabled", "role": "admin"})
        self.assertEqual(caught.exception.status, 403)

    def test_chef_language_read_only_reuses_link(self):
        status, body = self.call(http.CHEF_LANGUAGE, user=self.chef)
        self.assertEqual((status, body["language"]), (200, "en"))
        with self.assertRaises(http.APIError) as caught:
            self.call(http.CHEF_LANGUAGE, "PUT", self.chef,
                      body={"language": "pt"})
        self.assertEqual(caught.exception.status, 404)
        self.assertEqual(self.c.execute(
            "SELECT language FROM v2_chef_links WHERE user_id='chef-a'").fetchone()[0], "en")

    def test_admin_inspects_proposes_approves_and_reads_history(self):
        before = self.inspect()
        status, created = self.call(
            http.ADMIN_ROOT + "/propose", "POST", self.admin,
            body=self.proposal(before["source_hash"]))
        self.assertEqual((status, created["status"]), (201, "pending"))
        candidate = self.inspect()["candidate"]
        self.assertEqual(candidate["status"], "pending")
        self.assertEqual(self.inspect()["effective"]["text"], "Arroz branco")
        code, approved = self.call(
            http.ADMIN_ROOT + "/approve", "POST", self.admin,
            body=self.approval(before["source_hash"], candidate["candidate_hash"]))
        self.assertEqual((code, approved["status"]), (200, "approved"))
        self.assertEqual(self.inspect()["effective"]["text"], "White rice")
        code, history = self.call(
            http.ADMIN_ROOT + "/history", user=self.admin,
            query={"entity_kind":["food"],"entity_id":["f"],
                   "field_path":["display_name"]})
        self.assertEqual(code, 200)
        self.assertEqual([entry["action"] for entry in history["history"]],
                         ["approved", "submitted"])
        self.assertEqual(self.c.execute(
            "SELECT display_name FROM v2_food_library WHERE id='f'").fetchone()[0],
                         "Arroz branco")

    def test_admin_stale_candidate_returns_conflict(self):
        source_hash = self.inspect()["source_hash"]
        self.call(http.ADMIN_ROOT + "/propose", "POST", self.admin,
                  body=self.proposal(source_hash, "Rice"))
        old_hash = self.inspect()["candidate"]["candidate_hash"]
        self.call(http.ADMIN_ROOT + "/propose", "POST", self.admin,
                  body=self.proposal(source_hash, "Cooked white rice"))
        with self.assertRaises(http.APIError) as caught:
            self.call(http.ADMIN_ROOT + "/approve", "POST", self.admin,
                      body=self.approval(source_hash, old_hash))
        self.assertEqual(caught.exception.status, 409)

    def test_admin_stale_portuguese_returns_conflict(self):
        source_hash = self.inspect()["source_hash"]
        self.c.execute("UPDATE v2_food_library SET display_name='Arroz integral' WHERE id='f'")
        with self.assertRaises(http.APIError) as caught:
            self.call(http.ADMIN_ROOT + "/propose", "POST", self.admin,
                      body=self.proposal(source_hash))
        self.assertEqual(caught.exception.status, 409)

    def test_admin_query_validates_single_value(self):
        for query in (
            {"entity_kind":["food","dish"],"entity_id":["f"],"field_path":["display_name"]},
            {"entity_kind":["food"],"entity_id":["f"],"field_path":["display_name"],"foo":["x"]},
            {"entity_kind":["food"],"entity_id":["f"]},
        ):
            with self.subTest(query=query), self.assertRaises(http.APIError) as caught:
                self.call(http.ADMIN_ROOT, user=self.admin, query=query)
            self.assertEqual(caught.exception.status, 400)

    def test_no_auto_schema_creation_if_not_migrated(self):
        self.c.execute("DROP TABLE v2_player_language_preferences")
        with self.assertRaises(http.APIError) as caught:
            self.call(http.PLAYER_LANGUAGE, "PUT", self.a, body={"language":"en"})
        self.assertEqual((caught.exception.status, caught.exception.code),
                         (503, "translations_schema_unavailable"))
        with self.assertRaises(sqlite3.OperationalError):
            self.c.execute("SELECT * FROM v2_player_language_preferences")
        self.c.execute("DROP TABLE v2_content_translations")
        with self.assertRaises(http.APIError) as caught:
            self.inspect()
        self.assertEqual(caught.exception.status, 503)

    def test_new_routes_are_explicitly_off_in_real_app(self):
        source = pathlib.Path(__file__).with_name("app.py").read_text(encoding="utf-8")
        self.assertIn("MILE_APP_TRANSLATIONS_ENABLED", source)
        self.assertIn("MILE_BACKOFFICE_TRANSLATIONS_ENABLED", source)
        self.assertIn("os.environ.get(translation_flag, '0') != '1'", source)
        self.assertIn("if path in translation_pilot_routes:", source)
        self.assertIn("app_translation_http_v2.dispatch(", source)
        self.assertIn("user=dict(user)", source)
        self.assertIn("body=read_json(env) if method in ('PUT', 'POST') else None", source)
        self.assertIn("if user and not hmac.compare_digest(", source)
        self.assertIn("if user and user['role'] == 'chef' and path.startswith('/api/'):", source)
        self.assertLess(source.index("if user and not hmac.compare_digest("),
                        source.index("app_translation_http_v2.dispatch("))


if __name__ == "__main__":
    unittest.main()
