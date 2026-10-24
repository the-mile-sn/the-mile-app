"""Regression tests for the event/peri split (run with python -m unittest discover -s tests)."""
import json
import sqlite3
import time
import unittest
from datetime import date, timedelta

import events_v2
import peri_v2


class EventAndPeriTest(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY)")
        self.c.execute("CREATE TABLE v2_match_events(id TEXT PRIMARY KEY,athlete_id TEXT,match_date TEXT,match_time TEXT)")
        self.c.execute("INSERT INTO v2_athletes(id) VALUES('player')")
        events_v2.initialize(self.c)
        peri_v2.initialize(self.c)
        self.day=(date.today()+timedelta(days=5)).isoformat()

    def tearDown(self):
        self.c.close()

    def publish_fixture(self, kcal):
        identifier="import"+str(kcal)
        snapshot={"pre":[{"number":1,"title":"Pré-treino","totals":
                    {"kcal":str(kcal),"protein_g":"10","carbs_g":"20","fat_g":"0"},"items":[]}],
                  "post":[{"number":1,"title":"Pós-treino","totals":
                    {"kcal":"150","protein_g":"25","carbs_g":"4","fat_g":"1"},"items":[]}]}
        self.c.execute("""INSERT INTO v2_peri_imports
             (id,athlete_id,kind,filename,status,extracted_json,created_at)
             VALUES(?,?,?,?,?,?,?)""",(identifier,"player","training","test.pdf","published","{}",int(time.time())))
        self.c.execute("UPDATE v2_peri_publications SET replaced_at=? WHERE athlete_id='player' AND replaced_at IS NULL",
                       (int(time.time()),))
        self.c.execute("""INSERT INTO v2_peri_publications
             (id,athlete_id,kind,source_import_id,snapshot_json,published_at,published_by,replaced_at)
             VALUES(?,?,?,?,?,?,?,NULL)""",
             ("pub"+str(kcal),"player","training",identifier,json.dumps(snapshot),int(time.time()),"admin"))
        return identifier

    def test_morning_afternoon_and_nutrition_override_survive_new_pdf(self):
        event=events_v2.create_event(self.c,"player",{"event_date":self.day,"kind":"training",
                     "session":"morning","title":"Treino"},"admin")
        self.publish_fixture(220)
        before=peri_v2.list_event_meals(self.c,"player",self.day,self.day)
        self.assertEqual([x["phase"] for x in before],["pre","post"])
        changed=events_v2.update_event(self.c,"player",event["id"],{"session":"afternoon",
                    "pre_override":"off"},"admin",True)
        self.assertEqual(changed["session"],"afternoon")
        self.publish_fixture(300)
        after=peri_v2.list_event_meals(self.c,"player",self.day,self.day)
        self.assertEqual(len(after),1)
        self.assertEqual(after[0]["phase"],"post")
        self.assertEqual(after[0]["session"],"afternoon")

    def test_two_sessions_can_both_have_post_meals_when_kept_active(self):
        self.publish_fixture(220)
        for session in ("morning","afternoon"):
            events_v2.create_event(self.c,"player",{"event_date":self.day,"kind":"training",
                          "session":session,"title":"Treino"},"admin")
        meals=peri_v2.list_event_meals(self.c,"player",self.day,self.day)
        self.assertEqual(sum(m["phase"]=="post" for m in meals),2)

    def test_player_cannot_change_manual_override(self):
        event=events_v2.create_event(self.c,"player",{"event_date":self.day,"kind":"training",
                          "session":"morning","title":"Treino"},"admin")
        events_v2.update_event(self.c,"player",event["id"],{"pre_override":"off"},"admin",True)
        updated=events_v2.update_event(self.c,"player",event["id"],
                          {"session":"afternoon","pre_override":"on","title":"Hacked"},
                          "player",False)
        self.assertEqual(updated["pre_override"],"off")
        self.assertEqual(updated["title"],"Treino")

    def test_match_overrides(self):
        self.c.execute("INSERT INTO v2_match_events(id,athlete_id,match_date,match_time) VALUES('match1','player',?,'17:30')",
                       (self.day,))
        self.assertTrue(peri_v2.update_match_override(self.c,"player","match1","pre","off"))
        self.assertFalse(peri_v2.update_match_override(self.c,"player","missing","post","off"))


if __name__=="__main__":
    unittest.main()
