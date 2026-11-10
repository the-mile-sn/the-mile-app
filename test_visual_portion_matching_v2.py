"""Regression checks: preview may suggest pictures but never alter prescriptions."""
import sqlite3
import unittest
from unittest.mock import patch

import visual_portions_v2
import visual_portion_matching_v2 as matching


class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.conn=sqlite3.connect(":memory:")
        self.conn.row_factory=sqlite3.Row
        self.c=self.conn
        self.c.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,name TEXT,archived_at TEXT)")
        self.c.execute("INSERT INTO v2_athletes VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Jogador de teste',NULL)")
        self.c.execute("""CREATE TABLE v2_food_library(
            id TEXT PRIMARY KEY,display_name TEXT,category TEXT,active INTEGER)""")
        for food_id,name in [
            ("rice","Arroz branco cozido"),("potato","Batata cozida"),
            ("fish","Pescada cozida"),("chicken","Peito de frango grelhado"),
            ("dry","Arroz cru"),("pasta","Massa cozida"),
            ("rice_dish","Arroz de frango"),("rice_cake","Bolachas de arroz")]:
            self.c.execute("INSERT INTO v2_food_library VALUES(?,?,?,1)",
                           (food_id,name,"Outro"))
        visual_portions_v2.initialize(self.c)
        for i,(cat,grams,rice,potato) in enumerate([
            ("Arroz",200,None,None),("Arroz",250,None,None),
            ("Batata",100,None,None),("Arroz + Batata",350,250,100),
            ("Carne / Peixe",140,None,None),("Massa",180,None,None)
        ]):
            ref_id=f"{i+1:024x}"
            img_hash=f"{i+1:064x}"
            self.c.execute("INSERT INTO v2_visual_portion_images VALUES(?,?)",(img_hash,"UklGRg=="))
            self.c.execute("""INSERT INTO v2_visual_portions
                (id,source_row,category,total_g,rice_g,potato_g,image_sha256,
                 active,orientative,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (ref_id,i+1,cat,grams,rice,potato,img_hash,1,1,1,1))
        self.c.commit()
        self.library={r["id"]:dict(r) for r in self.c.execute(
            "SELECT id,display_name,category FROM v2_food_library WHERE active=1")}
        self.photos={}
        for r in self.c.execute("SELECT id,source_row,category,total_g,rice_g,potato_g FROM v2_visual_portions WHERE active=1"):
            self.photos.setdefault(r["category"],[]).append(dict(r))

    def tearDown(self):
        self.conn.close()

    def food(self,id,grams,**others):
        return {"id":id,"grams":grams,**others}

    def test_conservative_classification_and_raw(self):
        self.assertEqual(matching.classify("Bolachas de arroz"),(None,False))
        self.assertEqual(matching.classify("Arroz de frango"),(None,False))
        self.assertEqual(matching.classify("Arroz com feijão cozido"),("Arroz com leguminosas",False))
        self.assertEqual(matching.classify("Batata doce"),(None,False))
        self.assertEqual(matching.classify("Arroz cru"),("Arroz",True))
        self.assertEqual(matching.classify("Pescada cozida"),("Carne / Peixe",False))

    def test_exact_close_and_no_photo(self):
        option={"foods":[self.food("rice",200),self.food("pasta",175)]}
        groups=matching._option_items(option,self.library,self.photos)
        self.assertEqual(len(groups),2)
        rice=groups[0]["alternatives"][0]
        pasta=groups[1]["alternatives"][0]
        self.assertEqual(rice["match"],"exact")
        self.assertEqual(pasta["match"],"near")
        self.assertEqual(pasta["reference_g"],180)
        self.assertEqual(pasta["prescribed_g"],175)
        self.assertIsNone(matching._best_photo(self.photos,"Massa",600))

    def test_mix_matches_component_weights_not_only_total(self):
        option={"foods":[self.food("rice",250),self.food("potato",100)]}
        groups=matching._option_items(option,self.library,self.photos)
        self.assertEqual(len(groups),1)
        item=groups[0]["alternatives"][0]
        self.assertEqual(item["category"],"Arroz + Batata")
        self.assertEqual(item["match"],"exact")
        self.assertEqual((item["rice_g"],item["potato_g"]),(250,100))
        self.assertEqual((item["reference_rice_g"],item["reference_potato_g"]),(250,100))
        self.assertEqual(item["prescribed_g"],350)

    def test_mix_fallback_when_components_too_far(self):
        option={"foods":[self.food("rice",110),self.food("potato",240)]}
        groups=matching._option_items(option,self.library,self.photos)
        self.assertNotIn("Arroz + Batata",[g["alternatives"][0]["category"] for g in groups])
        self.assertEqual(len(groups),2)

    def test_alternatives_are_not_summed(self):
        option={"foods":[self.food("rice",250),self.food("potato",100,alternative_to=0)]}
        groups=matching._option_items(option,self.library,self.photos)
        self.assertEqual(len(groups),1)
        self.assertEqual([x["category"] for x in groups[0]["alternatives"]],["Arroz","Batata"])
        self.assertNotIn("Arroz + Batata",[x["category"] for x in groups[0]["alternatives"]])

    def test_white_meat_photo_used_for_fish(self):
        item=matching._entry(self.food("fish",140),self.library,self.photos)
        self.assertEqual(item["category"],"Carne / Peixe")
        self.assertEqual(item["photo_subject"],"Carne branca")
        self.assertEqual(item["match"],"exact")

    def test_dry_weight_does_not_match_cooked_photo(self):
        item=matching._entry(self.food("dry",200),self.library,self.photos)
        self.assertIsNone(item["photo_id"])
        self.assertEqual(item["match"],"raw_or_invalid")

    def test_inactive_reference_is_not_suggested(self):
        self.photos["Arroz"]=[]
        groups=matching._option_items({"foods":[self.food("rice",200)]},self.library,self.photos)
        self.assertIsNone(groups[0]["alternatives"][0]["photo_id"])

    def test_preview_only_published_not_drafts_and_no_database_changes(self):
        publication={"id":"p1","publication_state":"published","updated_at":123,
                     "draft":{"meals":[{"name":"Principal","options":[
                       {"title":"Opção 1","foods":[self.food("fish",140),self.food("rice",200)]}
                     ]}]}}
        unpublished={**publication,"publication_state":"draft","id":"p2"}
        with patch.object(matching,"published_for_athlete",
                          return_value={"Plano verde":[publication,unpublished]}) as mocked:
            prior=self.c.total_changes
            result=matching.preview_for_athlete(self.c,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
            self.assertEqual(self.c.total_changes,prior)
            self.assertEqual(len(result["plans"]),1)
            self.assertEqual([m["slot"] for m in result["plans"][0]["meals"]],["lunch","dinner"])
            self.assertFalse(result["published_to_players"])
            mocked.assert_called_once()

if __name__=="__main__":
    unittest.main()
