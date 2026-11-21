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
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "0", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "0"}):
            self.assertEqual(self.admin.request(self.query())["status"], 404)
            self.assertEqual(self.player.request("/api/v2/player/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/me")["status"], 200)

    def test_schema_unavailable_fails_without_creating_it(self):
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(
                self.player.request("/api/v2/player/language")["status"], 503)
            self.assertEqual(self.admin.request(self.query())["status"], 503)

    def test_player_language_persistence_and_csrf(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
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
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
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
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
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
        with patch.dict(os.environ, {"MILE_APP_TRANSLATIONS_ENABLED": "1", "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(Client().request(
                "/api/v2/player/language")["status"], 401)
            self.assertEqual(self.player.request(
                "/api/v2/chef/language")["status"], 403)
            self.assertEqual(self.admin.request(
                "/api/v2/player/language")["status"], 403)
            with patch.object(app, "SITE_ROLE", "admin"):
                self.assertEqual(self.player.request(
                    "/api/v2/player/language")["status"], 404)


    def test_backoffice_flag_independent_from_apps(self):
        self.init_i18n()
        with patch.dict(os.environ, {
            "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1",
            "MILE_APP_TRANSLATIONS_ENABLED": "0"}):
            self.assertEqual(self.admin.request(self.query())["status"], 200)
            self.assertEqual(self.admin.request(
                "/api/v2/admin/i18n/overview")["status"], 200)
            self.assertEqual(self.player.request("/api/v2/player/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/language")["status"], 404)
            self.assertEqual(self.chef.request("/api/v2/chef/me")["status"], 200)

    def test_workspace_assets_private_and_feature_gated(self):
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "0"}):
            self.assertEqual(self.admin.request("/admin-translations")["status"], 404)
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
            self.assertEqual(Client().request("/admin-translations")["status"], 401)
            self.assertEqual(self.player.request("/admin-translations")["status"], 403)
            self.assertEqual(self.chef.request("/admin-translations")["status"], 403)
            page = self.admin.request("/admin-translations")
            self.assertEqual(page["status"], 200, page)
            self.assertIn(b"Gest", page["body"])
            self.assertEqual(page["headers"]["Cache-Control"], "no-store")
            self.assertEqual(
                self.admin.request("/admin-translations.js")["status"], 200)
            self.assertEqual(
                self.admin.request("/admin-translations.css")["status"], 200)
            with patch.object(app, "SITE_ROLE", "player"):
                self.assertEqual(self.admin.request("/admin-translations")["status"], 404)

    def test_existing_dish_english_is_visible_only_for_review(self):
        self.init_i18n()
        with app.connect() as c:
            c.execute("""INSERT INTO v2_dish_library
                (id,category,name_pt,name_en,image_filename,active)
                VALUES ('dish-legacy','Carne','Frango com arroz',
                        'Chicken and rice','dish-placeholder',1)""")
            c.commit()
        with patch.dict(os.environ, {
            "MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1",
            "MILE_APP_TRANSLATIONS_ENABLED": "0"}):
            summary = self.admin.request("/api/v2/admin/i18n/overview")
            self.assertEqual(summary["status"], 200, summary)
            groups = {g["kind"]:g for g in summary["body"]["libraries"]}
            self.assertEqual(groups["dish"]["statuses"]["legacy_review"], 1)
            self.assertFalse(groups["recipe"]["integrated"])
            self.assertIsNone(groups["recipe"]["statuses"])
            self.assertIsNone(groups["plan"]["record_count"])
            item = self.admin.request(
                "/api/v2/admin/i18n/catalog?entity_kind=dish&status=legacy_review")
            self.assertEqual(item["status"], 200, item)
            self.assertEqual(item["body"]["total"], 1)
            found = item["body"]["items"][0]
            self.assertEqual(found["legacy_candidate"], "Chicken and rice")
            self.assertEqual(found["source_text"], "Frango com arroz")
            detail = self.admin.request(
                "/api/v2/admin/i18n?entity_kind=dish&entity_id=dish-legacy&field_path=name_pt")
            self.assertEqual(detail["body"]["effective"]["text"], "Frango com arroz")
            self.assertIsNone(detail["body"]["candidate"])
            proposal = self.admin.request("/api/v2/admin/i18n/propose", "POST", {
                "entity_kind": "dish", "entity_id": "dish-legacy",
                "field_path": "name_pt", "language": "en",
                "expected_source_hash": detail["body"]["source_hash"],
                "translated_text": found["legacy_candidate"]})
            self.assertEqual(proposal["status"], 201, proposal)
            next_summary = self.admin.request("/api/v2/admin/i18n/overview")
            status_by_kind = {g["kind"]:g["statuses"]
                              for g in next_summary["body"]["libraries"]
                              if g["integrated"]}
            self.assertEqual(status_by_kind["dish"]["pending"], 1)
            self.assertEqual(status_by_kind["dish"]["approved"], 0)
            with app.connect() as c:
                saved = c.execute(
                    "SELECT name_pt,name_en FROM v2_dish_library WHERE id='dish-legacy'"
                ).fetchone()
            self.assertEqual((saved["name_pt"], saved["name_en"]),
                             ("Frango com arroz", "Chicken and rice"))

    def test_catalog_filters_do_not_change_original_food(self):
        self.init_i18n()
        with patch.dict(os.environ, {"MILE_BACKOFFICE_TRANSLATIONS_ENABLED": "1"}):
            base = "/api/v2/admin/i18n/catalog?entity_kind=food&status=missing"
            result = self.admin.request(base+"&query=Arroz")
            self.assertEqual(result["status"], 200, result)
            self.assertEqual(result["body"]["total"], 1)
            self.assertEqual(result["body"]["items"][0]["field_path"], "display_name")
            empty = self.admin.request(base+"&query=sem-correspondencia")
            self.assertEqual(empty["body"]["total"], 0)
            self.assertEqual(self.player.request(base)["status"], 403)
            self.assertEqual(
                self.admin.request("/api/v2/admin/i18n/catalog?entity_kind=invalid")["status"],400)
            self.assertEqual(
                self.admin.request("/api/v2/admin/i18n/catalog?entity_kind=food&page_size=500")["status"],400)
            with app.connect() as c:
                row = c.execute(
                    "SELECT display_name,notes,kcal FROM v2_food_library WHERE id='foodtest'"
                ).fetchone()
            self.assertEqual((row["display_name"],row["notes"],row["kcal"]),
                             ("Arroz branco","Pesar cozido",130))


if __name__ == "__main__":
    unittest.main()
