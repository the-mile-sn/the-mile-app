"""Final EN pilot acceptance: publication, isolation and PT/EN/PT parity.

Every record is synthetic and held in an in-memory database. This suite never
connects to Render, touches real accounts or changes a prescription.
"""
import hashlib
import json
import os
import sqlite3
import unittest
from unittest.mock import patch

import food_plan_player_v2 as plans


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class PlayerLocaleFinalAcceptance(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
            CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,archived_at TEXT);
            CREATE TABLE v2_player_links(athlete_id TEXT,user_id TEXT);
            CREATE TABLE v2_food_plan_editor_publications(
                draft_id TEXT PRIMARY KEY,athlete_id TEXT,plan_type TEXT,
                snapshot_json TEXT,published_at INTEGER,state TEXT);
            CREATE TABLE v2_food_library(
                id TEXT PRIMARY KEY,display_name TEXT,variant TEXT,
                edible_fraction REAL,kcal REAL,protein_g REAL,
                carbs_g REAL,fat_g REAL,active INTEGER);
            CREATE TABLE v2_content_translations(
                entity_kind TEXT,entity_id TEXT,field_path TEXT,language TEXT,
                source_hash TEXT,translated_text TEXT,status TEXT);
            INSERT INTO v2_athletes VALUES('a1',NULL),('a2',NULL);
            INSERT INTO v2_player_links VALUES('a1','u1'),('a2','u2');
            INSERT INTO v2_food_library VALUES
              ('quark','Quark','plain',1.0,65,11,4,0.5,1);
        """)
        self.option = {
            "title":"Panquecas + Quark",
            "foods":[{"id":"quark","grams":125,
                      "display_name":"Quark","display_quantity":"125 g"}],
            "notes":["Beber água com esta refeição."],
            "order":[{"type":"food","index":0},{"type":"note","index":0}],
        }
        self.athlete1 = self.add_publication("a1","u1","d1")
        self.athlete2 = self.add_publication("a2","u2","d2")

    def tearDown(self):
        self.c.close()

    def add_publication(self,athlete_id,user_id,draft_id):
        data={"athlete_id":athlete_id,"player_id":user_id,
              "plan_type":"Plano amarelo",
              "meals":[{"name":"Pequeno-almoço / Lanche",
                        "options":[self.option]}]}
        raw=json.dumps(data,ensure_ascii=False,separators=(",",":"))
        self.c.execute("""INSERT INTO v2_food_plan_editor_publications
            VALUES(?,?,?, ?,100,'published')""",
            (draft_id,athlete_id,"Plano amarelo",raw))
        return "pub:"+digest(draft_id+"\0"+raw)

    def approve(self,kind,entity_id,field_path,pt,en,status="approved"):
        self.c.execute("""INSERT INTO v2_content_translations
            VALUES(?,?,?,?,?,?,?)""",
            (kind,entity_id,field_path,"en",digest(pt),en,status))

    def approved_a1(self):
        prefix="meals/0/options/0"
        self.approve("plan",self.athlete1,prefix+"/title",
                     "Panquecas + Quark","Pancakes + Quark")
        self.approve("plan",self.athlete1,prefix+"/notes/0",
                     "Beber água com esta refeição.",
                     "Drink water with this meal.")
        self.approve("plan",self.athlete1,prefix+"/foods/0/display_quantity",
                     "125 g","125 g")
        self.approve("food","quark","display_name","Quark","Quark")

    def options(self,athlete,language):
        data=plans.player_plans(self.c,athlete,language=language)
        yellow=data["options_by_color"]["yellow"]
        return data,yellow["breakfast"],yellow["snack"]

    def test_locale_roundtrip_preserves_canonical_identity_nutrition_and_notes(self):
        self.approved_a1()
        before_snapshot=self.c.execute(
            "SELECT snapshot_json FROM v2_food_plan_editor_publications WHERE draft_id='d1'"
        ).fetchone()["snapshot_json"]
        initial_approved=self.c.execute(
            "SELECT COUNT(*) AS n FROM v2_content_translations WHERE status='approved'"
        ).fetchone()["n"]
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            original,pt_breakfast,pt_snack=self.options("a1","pt")
            english,en_breakfast,en_snack=self.options("a1","en")
            restored,pt2_breakfast,pt2_snack=self.options("a1","pt")
        self.assertEqual(pt_breakfast,pt_snack)
        self.assertEqual(en_breakfast,en_snack)
        self.assertEqual(original,restored)
        self.assertEqual(pt_breakfast,pt2_breakfast)
        self.assertEqual(pt2_breakfast,pt2_snack)
        pt,en=pt_breakfast[0],en_breakfast[0]
        self.assertEqual((pt["title"],en["title"]),
                         ("Panquecas + Quark","Pancakes + Quark"))
        self.assertEqual(pt["option_ref"],en["option_ref"])
        self.assertEqual(pt["source_draft_id"],en["source_draft_id"])
        self.assertEqual(pt["totals"],en["totals"])
        self.assertEqual(pt["items"][0]["quantity"],en["items"][0]["quantity"])
        self.assertEqual(pt["items"][0]["name"],en["items"][0]["name"])
        self.assertEqual(pt["items"][1]["text"],"Beber água com esta refeição.")
        self.assertEqual(en["items"][1]["text"],"Drink water with this meal.")
        self.assertEqual(self.c.execute(
            "SELECT snapshot_json FROM v2_food_plan_editor_publications WHERE draft_id='d1'"
        ).fetchone()["snapshot_json"],before_snapshot)
        self.assertEqual(self.c.execute(
            "SELECT COUNT(*) AS n FROM v2_content_translations WHERE status='approved'"
        ).fetchone()["n"],initial_approved)

    def test_approved_other_players_translation_never_leaks_into_same_portuguese_text(self):
        self.approved_a1()
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            _,player1,_=self.options("a1","en")
            _,player2,_=self.options("a2","en")
        self.assertEqual(player1[0]["title"],"Pancakes + Quark")
        self.assertEqual(player2[0]["title"],"Panquecas + Quark")
        self.assertEqual(player1[0]["totals"],player2[0]["totals"])
        self.assertNotEqual(player1[0]["source_draft_id"],player2[0]["source_draft_id"])

    def test_stale_or_pending_translations_cannot_be_served_as_english(self):
        self.approve("plan",self.athlete1,"meals/0/options/0/title",
                     "Panquecas + Quark","Wrong historical translation","pending")
        self.approve("plan",self.athlete1,"meals/0/options/0/notes/0",
                     "Diferente nota antiga","Wrong old note")
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"1"}):
            _,english,_=self.options("a1","en")
        self.assertEqual(english[0]["title"],"Panquecas + Quark")
        self.assertEqual(english[0]["items"][1]["text"],
                         "Beber água com esta refeição.")

    def test_disabled_translation_flag_retains_exact_portuguese_presentation(self):
        self.approved_a1()
        with patch.dict(os.environ,{"MILE_APP_TRANSLATIONS_ENABLED":"0"}):
            en,breakfast,_=self.options("a1","en")
        self.assertEqual(breakfast[0]["title"],"Panquecas + Quark")
        self.assertEqual(breakfast[0]["totals"]["kcal"],81.25)


if __name__=="__main__":
    unittest.main()
