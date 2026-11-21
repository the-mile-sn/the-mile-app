"""Disposable SQLite regression suite for isolated app presentation."""
import copy
import hashlib
import json
import sqlite3
import unittest

import content_translations_v2 as store
import app_content_presentation_v2 as display


class PresentationTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.execute("""CREATE TABLE food (id TEXT PRIMARY KEY, display_name TEXT,
                       notes TEXT, kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL)""")
        self.c.execute("INSERT INTO food VALUES ('f1','Arroz branco','Pesar cozido',130,2.7,28.2,0.3)")
        self.c.execute("CREATE TABLE dish (id TEXT PRIMARY KEY, name_pt TEXT, name_en TEXT)")
        self.c.execute("INSERT INTO dish VALUES ('d1','Frango com arroz','Chicken and rice')")
        self.c.execute("""CREATE TABLE menus (menu_date TEXT, meal TEXT, kind TEXT,
                        value TEXT, dish_id TEXT)""")
        self.c.execute("INSERT INTO menus VALUES ('2026-11-23','lunch','dish','Frango com arroz','d1')")
        store.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def food(self):
        return self.c.execute("SELECT * FROM food").fetchone()

    def dish(self):
        return self.c.execute("SELECT * FROM dish").fetchone()

    def menu(self):
        return self.c.execute("SELECT * FROM menus").fetchone()

    def approve(self, kind, ident, field, source, translation):
        store.submit(self.c, entity_kind=kind, entity_id=ident, field_path=field,
                     source_text=source, translated_text=translation, actor_id="admin")
        store.approve(self.c, entity_kind=kind, entity_id=ident, field_path=field,
                      source_text=source, reviewer_id="reviewer")

    def test_portuguese_default(self):
        before = dict(self.food())
        result = display.present_food(self.c, self.food())
        self.assertEqual(result["presentation"]["name"]["text"], "Arroz branco")
        self.assertEqual(result["presentation"]["name"]["status"], "original")
        self.assertEqual({k:v for k,v in result.items() if k!="presentation"}, before)

    def test_approved_food_is_display_only(self):
        self.approve("food", "f1", "display_name", "Arroz branco", "White rice")
        self.approve("food", "f1", "notes", "Pesar cozido", "Weigh cooked")
        original = dict(self.food())
        writes = self.c.total_changes
        result = display.present_food(self.c, self.food(), language="en")
        self.assertEqual(result["presentation"]["name"]["text"], "White rice")
        self.assertEqual(result["presentation"]["notes"]["text"], "Weigh cooked")
        self.assertEqual({k:v for k,v in result.items() if k!="presentation"}, original)
        self.assertEqual(self.c.total_changes, writes)
        self.assertEqual(result["kcal"], 130)
        self.assertEqual(result["carbs_g"], 28.2)

    def test_pending_never_applied(self):
        store.submit(self.c, entity_kind="food", entity_id="f1", field_path="display_name",
                     source_text="Arroz branco", translated_text="Rice", actor_id="admin")
        result = display.present_food(self.c, self.food(), language="en")
        self.assertEqual(result["presentation"]["name"]["text"], "Arroz branco")
        self.assertEqual(result["presentation"]["name"]["status"], "pending")

    def test_stale_never_applied(self):
        self.approve("food", "f1", "display_name", "Arroz branco", "White rice")
        self.c.execute("UPDATE food SET display_name='Arroz cozido' WHERE id='f1'")
        result = display.present_food(self.c, self.food(), language="en")
        self.assertEqual(result["presentation"]["name"]["status"], "outdated")
        self.assertEqual(result["presentation"]["name"]["text"], "Arroz cozido")

    def test_old_name_en_does_not_bypass_review(self):
        result = display.present_dish(self.c, self.dish(), language="en")
        self.assertEqual(result["name_en"], "Chicken and rice")
        self.assertEqual(result["presentation"]["name"]["status"], "missing")
        self.assertEqual(result["presentation"]["name"]["text"], "Frango com arroz")

    def test_dish_link_by_id_only(self):
        self.approve("dish", "d1", "name_pt", "Frango com arroz", "Chicken with rice")
        original = dict(self.menu())
        result = display.present_menu(self.c, self.menu(), dish=self.dish(), language="en")
        self.assertEqual(result["presentation"]["name"]["text"], "Chicken with rice")
        self.assertEqual(result["value"], "Frango com arroz")
        self.assertEqual(result["dish_id"], "d1")
        self.assertEqual({k:v for k,v in result.items() if k!="presentation"}, original)

    def test_unlinked_legacy_menu_is_not_guessed(self):
        row = dict(self.menu())
        row["dish_id"] = None
        result = display.present_menu(self.c, row, dish=self.dish(), language="en")
        self.assertEqual(result["presentation"]["name"]["status"], "legacy_unlinked")
        self.assertEqual(result["presentation"]["name"]["text"], row["value"])

    def test_free_text_is_not_auto_translated(self):
        row = dict(self.menu())
        row.update({"kind": "text", "value": "Prato especial", "dish_id": None})
        result = display.present_menu(self.c, row, language="en")
        self.assertEqual(result["presentation"]["name"]["status"], "source_only")
        self.assertEqual(result["value"], "Prato especial")

    def test_id_mismatch_rejected(self):
        wrong = dict(self.dish())
        wrong["id"] = "d2"
        with self.assertRaisesRegex(ValueError, "menu_dish_id_mismatch"):
            display.present_menu(self.c, self.menu(), dish=wrong, language="en")

    def test_untrusted_display_rejected(self):
        row = dict(self.food())
        row["presentation"] = {"name": {"text": "Faked"}}
        with self.assertRaisesRegex(ValueError, "untrusted_presentation_field"):
            display.present_food(self.c, row, language="en")

    def test_invalid_locale_rejected(self):
        with self.assertRaisesRegex(ValueError, "invalid_presentation_language"):
            display.present_food(self.c, self.food(), language="fr")

    def test_option_identity_and_quantity_preserved(self):
        option = {"title": "Opção 1", "foods": [
            {"id":"f1","grams":100,"display_quantity":"1 taça"}],
            "notes":["Pesar cozido"]}
        source = copy.deepcopy(option)
        raw = lambda x: hashlib.sha256(json.dumps(
            x, sort_keys=True, separators=(",",":"), ensure_ascii=False).encode()).hexdigest()
        ref_before = raw(option)
        self.approve("food","f1","display_name","Arroz branco","White rice")
        displayed = display.present_food(self.c, self.food(), language="en")
        self.assertEqual(displayed["presentation"]["name"]["text"],"White rice")
        self.assertEqual(option,source)
        self.assertEqual(ref_before, raw(option))
        self.assertEqual(option["foods"][0]["grams"], 100)


if __name__ == "__main__":
    unittest.main()
