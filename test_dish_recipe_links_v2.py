"""Admin dish-to-recipe ID references: safe optional links, migration and deletion."""
import sqlite3
import unittest

import microcycles_v2 as dishes
import recipe_library_v2 as recipes


class DishRecipeAssociationTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        # Mimic app initialization, with dish schema created before recipe schema.
        dishes.initialize(self.c)
        recipes.initialize(self.c)
        self.category=recipes.create_category(self.c,"Carne branca")
        self.c.execute(
            "INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename)"
            " VALUES('dish01','Carne branca','Frango grelhado','','dish01.webp')")
        self.c.execute(
            "INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename)"
            " VALUES('dish02','Carne branca','Frango com molho','','dish02.webp')")
        self.c.commit()
        self.recipe=recipes.create_recipe(self.c,{
            "name":"Molho da casa","category_id":self.category["id"],
            "recipe_type":"standard","status":"draft","servings":2,
            "sections":[{"title":"","ingredients":[{"name":"Azeite","quantity":"10","unit":"g"}]}],
            "steps":[],"notes":"Mexer."
        })

    def tearDown(self):
        self.c.close()

    def test_optional_column_upgrades_and_is_idempotent(self):
        self.assertIn("recipe_id",{r["name"] for r in self.c.execute("PRAGMA table_info(v2_dish_library)")})
        recipes.initialize(self.c)
        self.assertEqual(recipes.list_dish_recipe_links(self.c)["dish01"]["recipe_id"],None)

    def test_associate_draft_then_unlink_without_touching_dish(self):
        linked=recipes.link_dish_recipe(self.c,"dish01",self.recipe["id"])
        self.assertEqual(linked["recipe_name"],"Molho da casa")
        self.assertEqual(linked["recipe_status"],"draft")
        row=self.c.execute("SELECT id,name_pt,image_filename,recipe_id FROM v2_dish_library WHERE id='dish01'").fetchone()
        self.assertEqual(row["recipe_id"],self.recipe["id"])
        self.assertEqual(row["name_pt"],"Frango grelhado")
        self.assertEqual(row["image_filename"],"dish01.webp")
        self.assertEqual(recipes.link_dish_recipe(self.c,"dish01",None)["recipe_id"],None)
        self.assertIsNone(self.c.execute("SELECT recipe_id FROM v2_dish_library WHERE id='dish01'").fetchone()[0])

    def test_recipe_is_stable_after_dish_or_recipe_rename(self):
        recipes.link_dish_recipe(self.c,"dish01",self.recipe["id"])
        self.c.execute("UPDATE v2_dish_library SET name_pt='Frango no forno' WHERE id='dish01'")
        self.c.execute("UPDATE v2_recipe_library SET name='Receita renomeada' WHERE id=?",(self.recipe["id"],))
        link=recipes.list_dish_recipe_links(self.c)["dish01"]
        self.assertEqual(link["recipe_id"],self.recipe["id"])
        self.assertEqual(link["recipe_name"],"Receita renomeada")
        self.assertEqual(self.c.execute("SELECT name_pt FROM v2_dish_library WHERE id='dish01'").fetchone()[0],"Frango no forno")

    def test_one_recipe_can_be_used_by_multiple_dishes(self):
        recipes.link_dish_recipe(self.c,"dish01",self.recipe["id"])
        recipes.link_dish_recipe(self.c,"dish02",self.recipe["id"])
        links=recipes.list_dish_recipe_links(self.c)
        self.assertEqual(links["dish01"]["recipe_id"],links["dish02"]["recipe_id"])

    def test_invalid_ids_rejected_without_updates(self):
        with self.assertRaisesRegex(ValueError,"invalid_recipe_reference"):
            recipes.link_dish_recipe(self.c,"dish01","f"*24)
        with self.assertRaisesRegex(ValueError,"invalid_recipe_reference"):
            recipes.link_dish_recipe(self.c,"dish01","not-an-id")
        with self.assertRaisesRegex(ValueError,"invalid_dish"):
            recipes.link_dish_recipe(self.c,"",self.recipe["id"])
        self.assertIsNone(recipes.link_dish_recipe(self.c,"missing",self.recipe["id"]))
        self.assertIsNone(recipes.list_dish_recipe_links(self.c)["dish01"]["recipe_id"])

    def test_deletion_rejected_while_linked_then_allowed_when_unlinked(self):
        recipes.link_dish_recipe(self.c,"dish01",self.recipe["id"])
        with self.assertRaisesRegex(ValueError,"recipe_in_use"):
            recipes.delete_recipe(self.c,self.recipe["id"])
        self.assertIsNotNone(recipes.get_recipe(self.c,self.recipe["id"]))
        recipes.link_dish_recipe(self.c,"dish01",None)
        self.assertTrue(recipes.delete_recipe(self.c,self.recipe["id"]))

    def test_menu_assignments_remain_intact(self):
        self.c.execute("INSERT INTO v2_athletes (id,name,created_at) VALUES('a1','Atleta',1)")
        dishes.save_menu(self.c,"a1","2026-11-03","lunch","dish","Frango grelhado","dish01")
        before=dict(self.c.execute("SELECT * FROM v2_weekly_menus WHERE athlete_id='a1'").fetchone())
        recipes.link_dish_recipe(self.c,"dish01",self.recipe["id"])
        after=dict(self.c.execute("SELECT * FROM v2_weekly_menus WHERE athlete_id='a1'").fetchone())
        self.assertEqual(before,after)


if __name__=="__main__":
    unittest.main()
