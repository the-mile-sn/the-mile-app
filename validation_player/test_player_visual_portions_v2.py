"""Player visual portions must use published plan refs and never mutate prescriptions."""
import sqlite3
import unittest
from unittest.mock import patch

import player_visual_portions_v2 as portions
from meal_option_selection_v2 import option_ref


class PlayerVisualPortionTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("CREATE TABLE v2_food_library(id TEXT PRIMARY KEY,display_name TEXT,category TEXT,active INTEGER)")
        for food_id,name in [
            ("rice","Arroz cozido"),("side","Acompanhamentos"),("meat","Carne ou peixe (cozinhado)"),
            ("raw","Arroz cru")]:
            self.c.execute("INSERT INTO v2_food_library VALUES(?,?,?,1)",(food_id,name,"Outro"))
        self.c.execute("""CREATE TABLE v2_visual_portions(id TEXT PRIMARY KEY,source_row INTEGER,
            category TEXT,total_g INTEGER,rice_g INTEGER,potato_g INTEGER,active INTEGER)""")
        for i,(category,grams,rice,potato) in enumerate([
            ("Arroz",220,None,None),("Arroz com leguminosas",220,None,None),
            ("Massa",220,None,None),("Batata",220,None,None),
            ("Arroz + Batata",200,150,50),("Carne / Peixe",110,None,None)]):
            self.c.execute("INSERT INTO v2_visual_portions VALUES(?,?,?,?,?,?,1)",
                           (f"{i+1:024x}",i+1,category,grams,rice,potato))
        self.c.commit()

    def tearDown(self):
        self.c.close()

    def test_generic_sides_and_meat_photo(self):
        library={r["id"]:dict(r) for r in self.c.execute(
            "SELECT id,display_name,category FROM v2_food_library")}
        catalogue={}
        for row in self.c.execute("SELECT * FROM v2_visual_portions WHERE active=1"):
            p=dict(row);catalogue.setdefault(p["category"],[]).append(p)
        foods={"foods":[{"id":"meat","grams":110},{"id":"side","grams":220}]}
        groups=portions._option_items(foods,library,catalogue)
        self.assertEqual(len(groups),2)
        self.assertEqual(groups[0]["alternatives"][0]["photo_subject"],"Carne branca")
        self.assertTrue(groups[1]["visual_examples"])
        self.assertEqual({x["category"] for x in groups[1]["alternatives"]},
                         {"Arroz","Arroz com leguminosas","Massa","Batata","Arroz + Batata"})
        self.assertEqual(foods["foods"][1]["grams"],220)

    def test_only_serves_existing_published_options_with_exact_source_ref(self):
        option={"title":"Sopa + Prato + Fruta","foods":[{"id":"meat","grams":110},{"id":"side","grams":220}]}
        ref=option_ref(option)
        source={"draft_id":"published-draft-1","content":{"meals":[{"name":"Principal","options":[option]}]}}
        with patch.object(portions,"_approved",return_value={"Plano amarelo":source}), \
             patch.object(portions,"player_plans",return_value={"options_by_color":{
                 "yellow":{"lunch":[{"option_ref":ref,"source_draft_id":"published-draft-1"}],
                           "dinner":[{"option_ref":ref,"source_draft_id":"published-draft-1"}]}}}):
            before=self.c.total_changes
            response=portions.compiled_for_athlete(self.c,"test-athlete")
            self.assertEqual(self.c.total_changes,before)
            self.assertEqual(response["source"],"published_planos")
            self.assertIn("yellow",response["options_by_color"])
            self.assertEqual(len(response["options_by_color"]["yellow"]["lunch"]),1)
            result=response["options_by_color"]["yellow"]["lunch"][0]
            self.assertEqual(result["option_ref"],ref)
            self.assertEqual(result["source_draft_id"],"published-draft-1")
            self.assertEqual(len(result["groups"][1]["alternatives"]),5)

    def test_stale_option_ref_yields_no_photos(self):
        option={"title":"Teste","foods":[{"id":"meat","grams":110}]}
        source={"draft_id":"p1","content":{"meals":[{"name":"Principal","options":[option]}]}}
        with patch.object(portions,"_approved",return_value={"Plano amarelo":source}), \
             patch.object(portions,"player_plans",return_value={"options_by_color":{
                 "yellow":{"lunch":[{"option_ref":"old-ref","source_draft_id":"p1"}],
                           "dinner":[]}}}):
            result=portions.compiled_for_athlete(self.c,"test-athlete")
            self.assertEqual(result["options_by_color"],{})

    def test_inactive_reference_is_excluded(self):
        self.c.execute("UPDATE v2_visual_portions SET active=0 WHERE category='Carne / Peixe'")
        source={"draft_id":"p1","content":{"meals":[{"name":"Principal","options":[
            {"title":"Prato","foods":[{"id":"meat","grams":110}]}
        ]}]}}
        ref=option_ref(source["content"]["meals"][0]["options"][0])
        with patch.object(portions,"_approved",return_value={"Plano amarelo":source}), \
             patch.object(portions,"player_plans",return_value={"options_by_color":{
                 "yellow":{"lunch":[{"option_ref":ref,"source_draft_id":"p1"}],
                           "dinner":[]}}}):
            self.assertEqual(portions.compiled_for_athlete(self.c,"a")["options_by_color"],{})

    def test_dry_amount_does_not_attach_cooked_photo(self):
        entry=portions._entry({"id":"raw","grams":220},
            {"raw":{"display_name":"Arroz cru"}},{"Arroz":[{"id":"x","source_row":1,"total_g":220}]})
        self.assertEqual(entry["match"],"raw_or_invalid")
        self.assertIsNone(entry["photo_id"])


if __name__=="__main__":
    unittest.main()
