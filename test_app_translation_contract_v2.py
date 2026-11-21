"""Isolated API-operation and account-locale tests; no live HTTP routes."""
import hashlib
import sqlite3
import unittest

import content_translations_v2 as translations
import app_translation_admin_v2 as admin_api
import app_language_preferences_v2 as preferences


class SecureOperationsTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("""CREATE TABLE users (
            id TEXT PRIMARY KEY, role TEXT NOT NULL, active INTEGER NOT NULL)""")
        self.c.executemany("INSERT INTO users VALUES (?,?,?)", (
            ("a1", "admin", 1), ("a2", "admin", 1), ("a-off", "admin", 0),
            ("p1", "player", 1), ("p2", "player", 1),
            ("chef1", "chef", 1), ("chef-off", "chef", 0),
        ))
        self.c.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, archived_at BIGINT)")
        self.c.execute("INSERT INTO v2_athletes VALUES ('athlete-1',NULL)")
        self.c.execute("""CREATE TABLE v2_chef_links (
            user_id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL,
            language TEXT NOT NULL DEFAULT 'pt', archived_at BIGINT)""")
        self.c.execute("""INSERT INTO v2_chef_links VALUES
            ('chef1','athlete-1','en',NULL),
            ('chef-off','athlete-1','pt',NULL)""")
        self.c.execute("""CREATE TABLE v2_food_library (
            id TEXT PRIMARY KEY, display_name TEXT, notes TEXT, active INTEGER)""")
        self.c.execute("""INSERT INTO v2_food_library VALUES
            ('f1','Arroz branco','Servir cozido',1),('f-arch','Inativo','',0)""")
        self.c.execute("""CREATE TABLE v2_dish_library (
            id TEXT PRIMARY KEY, name_pt TEXT, name_en TEXT, active INTEGER)""")
        self.c.execute("""INSERT INTO v2_dish_library VALUES
            ('d1','Frango com arroz','Chicken and rice',1)""")
        translations.initialize(self.c)
        preferences.initialize(self.c)
        preferences.initialize(self.c)
        self.admin = {"id": "a1", "role": "admin"}
        self.player = {"id": "p1", "role": "player"}
        self.chef = {"id": "chef1", "role": "chef"}

    def tearDown(self):
        self.c.close()

    def read(self, field="display_name", kind="food", ident="f1"):
        return admin_api.inspect(
            self.c, self.admin, entity_kind=kind, entity_id=ident,
            field_path=field)

    def submit(self, text="White rice", expected_source_hash=None, **other):
        body = {
            "entity_kind": "food", "entity_id": "f1",
            "field_path": "display_name", "language": "en",
            "expected_source_hash": expected_source_hash
                or self.read()["source_hash"], "translated_text": text}
        body.update(other)
        return admin_api.propose(self.c, self.admin, body)

    def approve(self, expected_candidate_hash=None, expected_source_hash=None):
        row = self.read()
        return admin_api.approve(self.c, self.admin, {
            "entity_kind": "food", "entity_id": "f1",
            "field_path": "display_name", "language": "en",
            "expected_source_hash": expected_source_hash or row["source_hash"],
            "expected_candidate_hash": (expected_candidate_hash
                if expected_candidate_hash is not None
                else row["candidate"]["candidate_hash"])})

    def test_no_candidate_and_source_hash(self):
        row = self.read()
        self.assertIsNone(row["candidate"])
        self.assertEqual(row["source_text"], "Arroz branco")
        self.assertEqual(row["source_hash"], hashlib.sha256(
            "Arroz branco".encode()).hexdigest())
        self.assertEqual(row["effective"]["text"], "Arroz branco")

    def test_only_active_admin_can_inspect_and_write(self):
        for actor in (self.player, self.chef, {"id": "a-off", "role": "admin"},
                      None, {"id": "p1", "role": "admin"}):
            with self.subTest(actor=actor):
                with self.assertRaises(PermissionError):
                    admin_api.inspect(self.c, actor, entity_kind="food",
                                      entity_id="f1", field_path="display_name")
                body = {"entity_kind": "food", "entity_id": "f1",
                        "field_path": "display_name", "language": "en",
                        "expected_source_hash": self.read()["source_hash"],
                        "translated_text": "Rice"}
                with self.assertRaises(PermissionError):
                    admin_api.propose(self.c, actor, body)

    def test_proposal_is_pending_and_only_approved_applies(self):
        self.submit()
        self.assertEqual(self.read()["candidate"]["status"], "pending")
        self.assertEqual(self.read()["effective"]["text"], "Arroz branco")
        self.approve()
        row = self.read()
        self.assertEqual(row["candidate"]["status"], "approved")
        self.assertEqual(row["effective"]["text"], "White rice")
        original = self.c.execute(
            "SELECT display_name FROM v2_food_library WHERE id='f1'").fetchone()
        self.assertEqual(original["display_name"], "Arroz branco")
        self.assertEqual(len(admin_api.audit(
            self.c, self.admin, entity_kind="food", entity_id="f1",
            field_path="display_name")), 2)

    def test_request_must_not_send_source_text_or_actor(self):
        with self.assertRaisesRegex(ValueError, "invalid_translation_payload"):
            self.submit(source_text="FAKE original")
        with self.assertRaisesRegex(ValueError, "invalid_translation_payload"):
            self.submit(actor_id="p1")

    def test_source_change_blocks_submitting_stale_editor(self):
        stale = self.read()["source_hash"]
        self.c.execute("UPDATE v2_food_library SET display_name='Arroz integral' WHERE id='f1'")
        with self.assertRaisesRegex(ValueError, "translation_source_changed"):
            self.submit(expected_source_hash=stale)

    def test_candidate_change_blocks_stale_approval(self):
        self.submit(text="Rice")
        reviewed = self.read()["candidate"]["candidate_hash"]
        self.submit(text="Unreviewed change")
        with self.assertRaisesRegex(ValueError, "translation_changed_during_review"):
            self.approve(expected_candidate_hash=reviewed)
        self.assertEqual(self.read()["candidate"]["status"], "pending")

    def test_source_change_blocks_approval(self):
        self.submit()
        review = self.read()
        self.c.execute("UPDATE v2_food_library SET display_name='Arroz integral' WHERE id='f1'")
        with self.assertRaisesRegex(ValueError, "translation_source_changed"):
            self.approve(expected_source_hash=review["source_hash"],
                         expected_candidate_hash=review["candidate"]["candidate_hash"])
        self.assertEqual(self.read()["candidate"]["status"], "outdated")
        self.assertEqual(self.read()["effective"]["text"], "Arroz integral")

    def test_whitelist_excludes_nutrition_and_inactive_records(self):
        with self.assertRaisesRegex(ValueError, "invalid_translation_field"):
            admin_api.inspect(self.c, self.admin, entity_kind="food",
                              entity_id="f1", field_path="kcal")
        with self.assertRaisesRegex(ValueError, "invalid_translation_field"):
            admin_api.inspect(self.c, self.admin, entity_kind="plan",
                              entity_id="f1", field_path="notes")
        with self.assertRaises(LookupError):
            admin_api.inspect(self.c, self.admin, entity_kind="food",
                              entity_id="f-arch", field_path="display_name")

    def test_dish_and_food_notes_are_supported(self):
        dish = self.read(kind="dish", ident="d1", field="name_pt")
        self.assertEqual(dish["source_text"], "Frango com arroz")
        note = self.read(field="notes")
        self.assertEqual(note["source_text"], "Servir cozido")

    def test_locale_defaults_pt_for_player_without_row(self):
        before = self.c.execute(
            "SELECT COUNT(*) FROM v2_player_language_preferences").fetchone()[0]
        self.assertEqual(preferences.read(self.c, self.player)["language"], "pt")
        after = self.c.execute(
            "SELECT COUNT(*) FROM v2_player_language_preferences").fetchone()[0]
        self.assertEqual(before, after)

    def test_locale_player_persists_without_changing_others(self):
        preferences.save(self.c, self.player, "en")
        self.assertEqual(preferences.read(self.c, self.player)["language"], "en")
        self.assertEqual(preferences.read(self.c, {"id":"p2","role":"player"})["language"], "pt")
        preferences.save(self.c, self.player, "pt")
        self.assertEqual(preferences.read(self.c, self.player)["language"], "pt")
        self.assertEqual(preferences.read(self.c, self.chef)["language"], "en")

    def test_chef_keeps_existing_link_language(self):
        self.assertEqual(preferences.read(self.c, self.chef)["language"], "en")
        preferences.save(self.c, self.chef, "pt")
        self.assertEqual(self.c.execute(
            "SELECT language FROM v2_chef_links WHERE user_id='chef1'").fetchone()[0], "pt")
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) FROM v2_player_language_preferences").fetchone()[0], 0)

    def test_language_rejects_other_roles_and_invalid_values(self):
        for actor in (self.admin, {"id":"chef-off","role":"chef"}, None,
                      {"id":"p1","role":"chef"}):
            with self.subTest(actor=actor):
                with self.assertRaises(PermissionError):
                    preferences.read(self.c, actor)
        with self.assertRaisesRegex(ValueError, "invalid_language"):
            preferences.save(self.c, self.player, "fr")
        with self.assertRaisesRegex(ValueError, "invalid_language"):
            preferences.save(self.c, self.player, None)

    def test_archived_chef_cannot_change_language(self):
        self.c.execute("UPDATE v2_chef_links SET archived_at=123 WHERE user_id='chef1'")
        with self.assertRaisesRegex(PermissionError, "chef_unlinked"):
            preferences.read(self.c, self.chef)
        with self.assertRaisesRegex(PermissionError, "chef_unlinked"):
            preferences.save(self.c, self.chef, "en")

    def test_inspection_is_read_only(self):
        self.submit()
        before = self.c.total_changes
        self.read()
        admin_api.audit(self.c, self.admin, entity_kind="food",
                        entity_id="f1", field_path="display_name")
        self.assertEqual(self.c.total_changes, before)


if __name__ == "__main__":
    unittest.main()
