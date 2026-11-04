"""Regression tests for multiple dish-recipe associations."""
import sqlite3
import unittest
import microcycles_v2 as dishes
import recipe_library_v2 as recipes

class MultipleDishRecipesTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        dishes.initialize(self.db)
        recipes.initialize(self.db)
        cat=recipes.create_category(self.db,"Testes")
        self.db.execute("INSERT INTO v2_dish_library(id,category,name_pt,name_en,image_filename) VALUES('dish01','Testes','Prato','','dish.webp')")
        self.db.commit()
        self.ids=[]
        for name in ("Receita A","Receita B"):
            self.ids.append(recipes.create_recipe(self.db,{"name":name,"category_id":cat["id"],"recipe_type":"standard","status":"draft","servings":1,"sections":[],"steps":[],"notes":""})["id"])

    def tearDown(self):
        self.db.close()

    def test_add_remove_and_duplicate(self):
        a,b=self.ids
        recipes.add_dish_recipe(self.db,"dish01",a)
        recipes.add_dish_recipe(self.db,"dish01",b)
        recipes.add_dish_recipe(self.db,"dish01",a)
        self.assertEqual([r["recipe_id"] for r in recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"]],[a,b])
        with self.assertRaisesRegex(ValueError,"recipe_in_use"):
            recipes.delete_recipe(self.db,b)
        recipes.remove_dish_recipe(self.db,"dish01",a)
        self.assertEqual([r["recipe_id"] for r in recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"]],[b])
        self.assertTrue(recipes.delete_recipe(self.db,a))

    def test_legacy_backfill_and_idempotency(self):
        a,b=self.ids
        recipes.link_dish_recipe(self.db,"dish01",a)
        recipes.initialize(self.db)
        recipes.initialize(self.db)
        self.assertEqual(len(recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"]),1)
        recipes.add_dish_recipe(self.db,"dish01",b)
        recipes.initialize(self.db)
        self.assertEqual(len(recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"]),2)

    def test_legacy_replace_and_unlink(self):
        a,b=self.ids
        recipes.add_dish_recipe(self.db,"dish01",a)
        recipes.add_dish_recipe(self.db,"dish01",b)
        recipes.link_dish_recipe(self.db,"dish01",a)
        self.assertEqual(len(recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"]),1)
        recipes.link_dish_recipe(self.db,"dish01",None)
        self.assertEqual(recipes.list_dish_recipe_links(self.db)["dish01"]["recipes"],[])

if __name__=="__main__":
    unittest.main()
