"""Actual WSGI smoke tests for feature-flagged PT/EN routes on disposable SQLite.

Reuses the project's existing test_app.Client session/CSRF fixtures.
"""
import os
import unittest
from unittest.mock import patch

import test_app
import content_translations_v2 as translations
import app_language_preferences_v2 as preferences

app = test_app.app
Client = test_app.Client


class I18NWSGITests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)
        self.created = self.admin.request(
            "/api/v2/athletes", "POST", {
                "name": "Atleta Idioma", "username": "atletaidioma",
                "password": "password-secure-123",
                "sex": "M", "weight_kg": 72})
        self.assertEqual(self.created["status"], 201, self.created)
        self.aid = self.created["body"]["athlete"]["id"]
        self.player = Client()
        self.assertEqual(self.player.request(
            "/api/login", "POST", {"identifier": "atletaidioma",
                                   "password": "password-secure-123"})["status"], 200)
        self.player.request("/api/me")
        chef = self.admin.request("/api/v2/admin/chefs", "POST", {
            "name": "Chef Idioma", "username": "chefidioma",
            "password": "chef-password-123",
            "athlete_id": self.aid, "language": "en"})
        self.assertEqual(chef["status"], 201, chef)
        self.chef = Client()
        self.assertEqual(self.chef.request(
            "/api/login", "POST", {"identifier": "chefidioma",
                                   "password": "chef-password-123"})["status"], 200)
        self.chef.request("/api/me")
        with app.connect() as c:
            c.execute("""INSERT INTO v2_food_library
                (id,source_key,base_name,display_name,category,notes,variant,
                 edible_fraction,kcal,protein_g,carbs_g,fat_g,active,created_at,updated_at)
                VALUES ('foodtest',NULL,'Arroz','Arroz branco','Cereais',
                        'Pesar cozido','plain',1,130,2.7,28.2,0.3,1,1,1)""")
            c.commit()

    def init_i18n(self):
        with app.connect() as c:
            translations.initialize(c)
            preferences.initialize(c)
            c.commit()

    def query(self):
        return ("/api/v2/admin/i18n?entity_kind=food&entity_id=foodtest"
                "&field_path=display_name")

    def test_off_by_default_even_after_schema_installed(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "0"}):
            self.assertEqual(self.admin.request(self.query())["status"], 404)
            self.assertEqual(self.player.request("/api/v2/player/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/me")["status"], 200)

    def test_schema_unavailable_fails_without_creating_it(self):
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(
                self.player.request("/api/v2/player/language")["status"], 503)
            self.assertEqual(self.admin.request(self.query())["status"], 503)

    def test_player_language_persistence_and_csrf(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(self.player.request(
                "/api/v2/player/language")["body"]["language"], "pt")
            self.assertEqual(self.player.request(
                "/api/v2/player/language", "PUT", {"language": "en"},
                csrf=False)["status"], 403)
            self.assertEqual(self.player.request(
                "/api/v2/player/language", "PUT", {"language": "en"},
                origin="https://malicious.invalid")["status"], 403)
            self.assertEqual(self.player.request(
                "/api/v2/player/language", "PUT",
                {"language": "en", "user_id": "someone-else"})["status"], 400)
            saved = self.player.request(
                "/api/v2/player/language", "PUT", {"language": "en"})
            self.assertEqual(saved["status"], 200, saved)
            self.assertEqual(saved["body"]["language"], "en")
            self.assertEqual(self.player.request(
                "/api/v2/player/language")["body"]["language"], "en")
            self.assertEqual(self.chef.request(
                "/api/v2/chef/language")["body"]["language"], "en")

    def test_admin_reviewer_and_unchanged_original(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1"}):
            initial = self.admin.request(self.query())
            self.assertEqual(initial["status"], 200, initial)
            source_hash = initial["body"]["source_hash"]
            proposal = {
                "entity_kind": "food", "entity_id": "foodtest",
                "field_path": "display_name", "language": "en",
                "expected_source_hash": source_hash,
                "translated_text": "White rice"}
            self.assertEqual(self.player.request(self.query())["status"], 403)
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/propose", "POST", proposal, csrf=False)["status"], 403)
            submitted = self.admin.request(
                "/api/v2/admin/i18n/propose", "POST", proposal)
            self.assertEqual(submitted["status"], 201, submitted)
            pending = self.admin.request(self.query())["body"]
            self.assertEqual(pending["effective"]["text"], "Arroz branco")
            approved = self.admin.request("/api/v2/admin/i18n/approve", "POST", {
                "entity_kind": "food", "entity_id": "foodtest",
                "field_path": "display_name", "language": "en",
                "expected_source_hash": source_hash,
                "expected_candidate_hash": pending["candidate"]["candidate_hash"]})
            self.assertEqual(approved["status"], 200, approved)
            viewed = self.admin.request(self.query())
            self.assertEqual(viewed["body"]["effective"]["text"], "White rice")
            with app.connect() as c:
                original = c.execute(
                    "SELECT display_name,kcal,carbs_g FROM v2_food_library WHERE id='foodtest'").fetchone()
            self.assertEqual((original["display_name"],original["kcal"],original["carbs_g"]),
                             ("Arroz branco", 130, 28.2))

    def test_existing_chef_preference_remains_only_writer(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(self.chef.request(
                "/api/v2/chef/language")["body"]["language"], "en")
            self.assertEqual(self.chef.request(
                "/api/v2/chef/language", "PUT", {"language": "pt"})["status"], 404)
            changed = self.chef.request(
                "/api/v2/chef/preferences", "PUT", {"language": "pt"})
            self.assertEqual(changed["status"], 200, changed)
            self.assertEqual(self.chef.request(
                "/api/v2/chef/language")["body"]["language"], "pt")

    def test_no_cross_service_or_role_authorization(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(Client().request(
                "/api/v2/player/language")["status"], 401)
            self.assertEqual(self.player.request(
                "/api/v2/chef/language")["status"], 403)
            self.assertEqual(self.admin.request(
                "/api/v2/player/language")["status"], 403)
            with patch.object(app, "SITE_ROLE", "admin"):
                self.assertEqual(self.player.request(
                    "/api/v2/player/language")["status"], 404)


if __name__ == "__main__":
    unittest.main()
