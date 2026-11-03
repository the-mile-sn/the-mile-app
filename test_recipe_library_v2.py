"""Regression tests for the isolated culinary recipe library."""
import sqlite3
import unittest

import recipe_library_v2 as recipes


class RecipeLibraryTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        recipes.initialize(self.c)
        self.category = recipes.create_category(self.c, "Carne branca")

    def tearDown(self):
        self.c.close()

    def data(self, **updates):
        payload = {
            "name": "Bife com molho de cogumelos",
            "category_id": self.category["id"],
            "recipe_type": "adaptable",
            "status": "draft",
            "servings": 2,
            "sections": [
                {"title": "Para os bifes", "ingredients": [
                    {"name": "Bife", "quantity": "180", "unit": "g"},
                    {"name": "Azeite", "quantity": "10", "unit": "g"}]},
                {"title": "Para o molho", "ingredients": [
                    {"name": "Cogumelos", "quantity": "100", "unit": "g"},
                    {"name": "Azeite", "quantity": "10", "unit": "g"}]}
            ],
            "steps": ["Grelhar os bifes.", "Saltear os cogumelos e envolver no molho."],
            "notes": "Temperar a gosto."
        }
        payload.update(updates)
        return payload

    def test_schema_is_additive_and_idempotent(self):
        recipes.initialize(self.c)
        self.assertEqual(
            [row["name"] for row in self.c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'v2_recipe_%'").fetchall()],
            ["v2_recipe_categories", "v2_recipe_library"]
        )
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_recipe_library").fetchone()[0], 0)

    def test_categories_use_stable_ids_and_deduplicate_case(self):
        same = recipes.create_category(self.c, "carne BRANCA")
        self.assertEqual(same["id"], self.category["id"])
        self.assertEqual(len(recipes.list_categories(self.c)), 1)

    def test_create_edit_and_preserve_separate_ingredient_blocks(self):
        entry = recipes.create_recipe(self.c, self.data())
        self.assertEqual(entry["recipe_type"], "adaptable")
        self.assertEqual(len(entry["sections"]), 2)
        self.assertEqual([x["quantity"] for s in entry["sections"] for x in s["ingredients"] if x["name"] == "Azeite"], ["10", "10"])
        self.assertEqual(len(recipes.list_recipes(self.c)), 1)
        source_id = entry["sections"][0]["ingredients"][0]["id"]
        update = self.data(name="Bife com molho de cogumelos (revisto)")
        update["sections"] = entry["sections"]
        updated = recipes.update_recipe(self.c, entry["id"], update)
        self.assertEqual(updated["sections"][0]["ingredients"][0]["id"], source_id)
        self.assertEqual(updated["id"], entry["id"])

    def test_standard_recipe_can_be_draft_without_ingredients(self):
        recipe = recipes.create_recipe(self.c, self.data(
            recipe_type="standard", sections=[{"title": "", "ingredients": []}], steps=[]
        ))
        self.assertEqual(recipe["status"], "draft")

    def test_approved_recipe_requires_ingredients_and_steps(self):
        with self.assertRaisesRegex(ValueError, "incomplete_recipe"):
            recipes.create_recipe(self.c, self.data(status="published", steps=[]))
        with self.assertRaisesRegex(ValueError, "incomplete_recipe"):
            recipes.create_recipe(self.c, self.data(status="published", sections=[]))
        approved = recipes.create_recipe(self.c, self.data(status="published"))
        self.assertEqual(approved["status"], "published")

    def test_invalid_category_rejected_without_mutation(self):
        with self.assertRaisesRegex(ValueError, "invalid_recipe_category"):
            recipes.create_recipe(self.c, self.data(category_id="unrelated"))
        self.assertEqual(len(recipes.list_recipes(self.c)), 0)

    def test_culinary_measures_and_notes_accept_text(self):
        draft = recipes.create_recipe(self.c, self.data(sections=[
            {"title": "", "ingredients": [{"name": "Canela", "quantity": "q.b.", "unit": ""}]}
        ]))
        self.assertEqual(draft["sections"][0]["ingredients"][0]["quantity"], "q.b.")
        self.assertEqual(draft["notes"], "Temperar a gosto.")

    def test_reject_duplicate_ingredient_identifiers(self):
        with self.assertRaisesRegex(ValueError, "duplicate_recipe_item_id"):
            recipes.create_recipe(self.c, self.data(sections=[
                {"title": "Base", "ingredients": [
                    {"id": "a"*24, "name": "Azeite"},
                    {"id": "a"*24, "name": "Azeite"}
                ]}
            ]))

    def test_delete_only_target_recipe_and_its_own_photo(self):
        self.c.execute("CREATE TABLE v2_shared_images(image_key TEXT PRIMARY KEY,image_data BLOB NOT NULL)")
        first = recipes.create_recipe(self.c, self.data(name="Primeira receita"))
        second = recipes.create_recipe(self.c, self.data(name="Segunda receita"))
        first_key = recipes.set_photo(self.c, first["id"])
        second_key = recipes.set_photo(self.c, second["id"])
        self.c.execute("INSERT INTO v2_shared_images VALUES(?,?)", (first_key, b"first"))
        self.c.execute("INSERT INTO v2_shared_images VALUES(?,?)", (second_key, b"second"))
        self.c.execute("INSERT INTO v2_shared_images VALUES(?,?)", ("dish-keep.webp", b"dish"))
        self.c.commit()
        self.assertTrue(recipes.delete_recipe(self.c, first["id"]))
        self.assertIsNone(recipes.get_recipe(self.c, first["id"]))
        self.assertIsNotNone(recipes.get_recipe(self.c, second["id"]))
        keys = {row["image_key"] for row in self.c.execute("SELECT image_key FROM v2_shared_images")}
        self.assertNotIn(first_key, keys)
        self.assertIn(second_key, keys)
        self.assertIn("dish-keep.webp", keys)
        self.assertFalse(recipes.delete_recipe(self.c, first["id"]))
        self.assertFalse(recipes.delete_recipe(self.c, "invalid"))

    def test_recipe_without_photo_deletes_without_modifying_other_data(self):
        first = recipes.create_recipe(self.c, self.data(name="Sem foto"))
        second = recipes.create_recipe(self.c, self.data(name="Outra"))
        self.assertTrue(recipes.delete_recipe(self.c, first["id"]))
        self.assertEqual([r["id"] for r in recipes.list_recipes(self.c)], [second["id"]])

    def test_photo_key_cannot_overlap_dish_ids(self):
        recipe = recipes.create_recipe(self.c, self.data())
        self.assertEqual(recipes.photo_key(recipe["id"]), "recipe-" + recipe["id"] + ".webp")
        self.assertEqual(recipes.set_photo(self.c, recipe["id"]), recipes.photo_key(recipe["id"]))
        self.assertEqual(recipes.get_recipe(self.c, recipe["id"])["photo_key"], recipes.photo_key(recipe["id"]))


if __name__ == "__main__":
    unittest.main()
