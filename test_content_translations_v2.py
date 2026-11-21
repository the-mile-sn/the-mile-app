"""Regression tests for the opt-in translation foundation (no app import)."""

import sqlite3
import unittest

import content_translations_v2 as translations


class TranslationFoundationTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("CREATE TABLE v2_food_library (id TEXT PRIMARY KEY, display_name TEXT)")
        self.c.execute("INSERT INTO v2_food_library VALUES ('f1','Arroz branco')")
        translations.initialize(self.c)
        translations.initialize(self.c)
        self.key = {"entity_kind": "food", "entity_id": "f1", "field_path": "display_name"}

    def tearDown(self):
        self.c.close()

    def view(self, text="Arroz branco", language="en"):
        return translations.resolve(self.c, **self.key, source_text=text, language=language)

    def submit(self, text="Arroz branco", translated="White rice"):
        return translations.submit(
            self.c, **self.key, source_text=text,
            translated_text=translated, actor_id="admin-a")

    def approve(self, text="Arroz branco"):
        return translations.approve(
            self.c, **self.key, source_text=text, reviewer_id="admin-b")

    def test_no_translation_falls_back_to_portuguese(self):
        self.assertEqual(self.view(), {
            "text": "Arroz branco", "status": "missing", "language": "pt"})
        self.assertEqual(self.view(language="pt")["status"], "original")

    def test_pending_is_never_published(self):
        self.submit()
        self.assertEqual(self.view()["text"], "Arroz branco")
        self.assertEqual(self.view()["status"], "pending")

    def test_approved_translation_is_display_only(self):
        self.submit()
        self.approve()
        self.assertEqual(self.view(), {
            "text": "White rice", "status": "approved", "language": "en"})
        row = self.c.execute(
            "SELECT display_name FROM v2_food_library WHERE id='f1'").fetchone()
        self.assertEqual(row["display_name"], "Arroz branco")
        self.assertEqual(self.view(language="pt")["text"], "Arroz branco")

    def test_changing_source_invalidates_without_rewriting_record(self):
        self.submit()
        self.approve()
        self.assertEqual(self.view("Arroz branco cozido")["status"], "outdated")
        self.assertEqual(self.view("Arroz branco cozido")["text"], "Arroz branco cozido")
        self.assertEqual(self.view()["status"], "approved")
        with self.assertRaisesRegex(ValueError, "translation_source_changed"):
            self.approve("Arroz branco cozido")

    def test_new_proposal_revokes_previous_approval_until_reviewed(self):
        self.submit()
        self.approve()
        self.submit(translated="Cooked white rice")
        self.assertEqual(self.view()["status"], "pending")
        self.approve()
        self.assertEqual(self.view()["text"], "Cooked white rice")
        self.assertEqual([r["action"] for r in translations.history(self.c, **self.key)],
                         ["approved", "submitted", "approved", "submitted"])

    def test_entity_and_field_scopes_are_independent(self):
        self.submit()
        self.approve()
        other = {"entity_kind": "recipe", "entity_id": "f1",
                 "field_path": "display_name"}
        self.assertEqual(translations.resolve(
            self.c, **other, source_text="Arroz branco", language="en")["status"], "missing")
        self.assertEqual(translations.resolve(
            self.c, entity_kind="food", entity_id="f1", field_path="notes",
            source_text="Cozer", language="en")["status"], "missing")

    def test_only_english_is_allowed_for_writes(self):
        with self.assertRaisesRegex(ValueError, "invalid_translation_language"):
            translations.submit(
                self.c, **self.key, source_text="Arroz branco",
                translated_text="Riso", actor_id="admin-a", language="it")

    def test_empty_candidate_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid_translation_text"):
            self.submit(translated=" ")

    def test_history_does_not_change_canonical_data(self):
        self.submit()
        self.approve()
        self.assertEqual(len(translations.history(self.c, **self.key)), 2)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_food_library").fetchone()[0], 1)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_content_translations").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
