"""Regression coverage for session-scoped recipe access and stable menu IDs."""
import unittest
import sqlite3
import json

import microcycles_v2 as menus
import player_recipes_v2 as recipes


class PlayerRecipeQueries(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("CREATE TABLE users(id TEXT PRIMARY KEY)")
        menus.initialize(self.c)
        recipes.initialize(self.c)
        for aid in ("athlete1","athlete2"):
            self.c.execute("INSERT INTO v2_athletes(id,name,created_at) VALUES(?,?,1)",(aid,aid))
        for did,name in (("dish01","Prato A"),("dish02","Prato B")):
            self.c.execute("""INSERT INTO v2_dish_library
                (id,category,name_pt,name_en,image_filename,active)
                VALUES(?,'Carne branca',?,'',?,1)""",(did,name,did+".webp"))
        self.cat1="a"*24
        self.cat2="b"*24
        self.rid1="1"*24
        self.rid2="2"*24
        self.rid_draft="3"*24
        for cat in (self.cat1,self.cat2):
            self.c.execute("INSERT INTO v2_recipe_categories(id,name,created_at) VALUES(?,?,1)",(cat,cat))
        for rid,cat,status in ((self.rid1,self.cat1,"published"),
                               (self.rid2,self.cat2,"published"),
                               (self.rid_draft,self.cat1,"draft")):
            self.c.execute("""INSERT INTO v2_recipe_library
                (id,category_id,name,recipe_type,status,servings,sections_json,
                 steps_json,notes,photo_key,source_document,created_at,updated_at)
                VALUES(?,?,?,'standard',?,4,'[]','[]','','recipe.webp','',1,1)""",
                (rid,cat,rid,status))
        self.c.execute("""INSERT INTO v2_athlete_recipe_category_access
            (athlete_id,category_id) VALUES(?,?)""",("athlete1",self.cat1))
        for pos,rid in enumerate((self.rid1,self.rid2,self.rid_draft)):
            self.c.execute("""INSERT INTO v2_dish_recipe_links
                (dish_id,recipe_id,position) VALUES('dish01',?,?)""",(rid,pos))
        self.c.execute("""INSERT INTO v2_weekly_menus
            (athlete_id,menu_date,meal,kind,value,dish_id)
            VALUES('athlete1','2026-11-04','lunch','dish','Prato A','dish01')""")
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def test_category_access_is_independent_from_assigned_dish(self):
        self.assertEqual([x["id"] for x in recipes.library_for_athlete(self.c,"athlete1")],[self.rid1])
        self.assertEqual(recipes.library_for_athlete(self.c,"athlete2"),[])
        self.assertEqual([x["id"] for x in recipes.published_for_dish(self.c,"athlete1","dish01")],
                         [self.rid1,self.rid2])
        self.assertIsNone(recipes.published_for_dish(self.c,"athlete2","dish01"))
        self.assertEqual(recipes.dish_recipe_counts(self.c,"athlete1")["dish01"],2)
        self.assertIsNotNone(recipes.recipe_for_athlete(self.c,"athlete1",self.rid2))
        self.assertIsNone(recipes.recipe_for_athlete(self.c,"athlete2",self.rid2))
        self.assertIsNone(recipes.recipe_for_athlete(self.c,"athlete1",self.rid_draft))

    def test_multiple_dishes_no_guessing_duplicate_names(self):
        self.c.execute("""INSERT INTO v2_weekly_menus
            (athlete_id,menu_date,meal,kind,value,dish_id)
            VALUES('athlete2','2026-11-04','lunch','dish','Prato A',NULL)""")
        self.assertTrue(recipes.dish_assigned_to_athlete(self.c,"athlete2","dish01"))
        self.c.execute("""INSERT INTO v2_dish_library
            (id,category,name_pt,name_en,image_filename) VALUES
            ('dish03','Carne branca','Prato A','','dish03.webp')""")
        self.assertFalse(recipes.dish_assigned_to_athlete(self.c,"athlete2","dish01"))
        self.assertTrue(recipes.dish_assigned_to_athlete(self.c,"athlete1","dish01"))

    def test_menus_include_stable_dish_ids_and_publish_does_not_edit_menu(self):
        row=menus.list_menus(self.c,"athlete1","2026-11-04","2026-11-04")[0]
        self.assertEqual(row["dish_id"],"dish01")
        self.assertEqual(row["value"],"Prato A")
        self.c.execute("UPDATE v2_dish_library SET name_pt='Novo nome' WHERE id='dish01'")
        row=menus.list_menus(self.c,"athlete1","2026-11-04","2026-11-04")[0]
        self.assertEqual((row["dish_id"],row["value"]),("dish01","Novo nome"))
        raw=self.c.execute("SELECT value FROM v2_weekly_menus WHERE athlete_id='athlete1'").fetchone()[0]
        self.assertEqual(raw,"Prato A")

    def test_schema_idempotent_without_overwriting_content(self):
        before=self.c.execute("SELECT COUNT(*) FROM v2_dish_recipe_links").fetchone()[0]
        recipes.initialize(self.c)
        recipes.initialize(self.c)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_dish_recipe_links").fetchone()[0],before)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_recipe_library").fetchone()[0],3)


if __name__=="__main__":
    unittest.main()
