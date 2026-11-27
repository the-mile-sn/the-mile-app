"""Synthetic destination tests; no production DB or network."""
import sqlite3
import unittest

from notification_inbox_v2 import destination


class DestinationTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.executescript("""
            CREATE TABLE v2_athletes(id TEXT,archived_at TEXT);
            CREATE TABLE v2_player_links(user_id TEXT,athlete_id TEXT);
            CREATE TABLE v2_chef_links(user_id TEXT,athlete_id TEXT,archived_at TEXT);
            CREATE TABLE v2_match_events(id TEXT,athlete_id TEXT,match_date TEXT);
            CREATE TABLE v2_body_assessments(id TEXT,athlete_id TEXT,assessed_on TEXT,status TEXT);
            CREATE TABLE documents(id TEXT,user_id TEXT,folder TEXT);
            CREATE TABLE v2_weekly_menus(athlete_id TEXT,menu_date TEXT);
            INSERT INTO v2_athletes VALUES('a',NULL),('b',NULL);
            INSERT INTO v2_player_links VALUES('p','a');
            INSERT INTO v2_chef_links VALUES('c','a',NULL);
            INSERT INTO v2_match_events VALUES('g','a','2026-11-25'),('other','b','2026-11-25');
            INSERT INTO v2_body_assessments VALUES('s','a','2026-11-20','published'),('draft','a','2026-11-21','draft');
            INSERT INTO documents VALUES('d','p','nutrition'),('hidden','p','menus'),('foreign','q','nutrition'),('weekly','p','weekly');
            INSERT INTO v2_weekly_menus VALUES('a','2026-11-25');
        """)
        self.player={"id":"p","role":"player","menus_enabled":False,"anthropometry_enabled":False}
        self.chef={"id":"c","role":"chef"}

    def tearDown(self):
        self.c.close()

    def route(self,kind,target=None,user=None):
        return destination(self.c,user=user or self.player,item={"kind":kind,"target_id":target})

    def test_game_exact_and_foreign_fallback(self):
        self.assertEqual(self.route("game","g"),{"kind":"game","id":"g","date":"2026-11-25"})
        self.assertEqual(self.route("game","other"),{"kind":"game"})

    def test_weight_player_only(self):
        self.assertEqual(self.route("weight"),{"kind":"weight"})
        self.assertIsNone(self.route("weight",user=self.chef))

    def test_document_permissions(self):
        self.assertEqual(self.route("document","d"),{"kind":"document","id":"d"})
        for target in ("hidden","foreign","weekly","missing"):
            self.assertIsNone(self.route("document",target))
        self.assertIsNone(self.route("document","d",self.chef))

    def test_assessment_visibility(self):
        self.assertEqual(self.route("assessment","s"),{"kind":"assessment","id":"s","date":"2026-11-20"})
        self.assertEqual(self.route("assessment","draft"),{"kind":"assessment"})

    def test_menu_week_and_current_association(self):
        for user in (self.player,self.chef):
            self.assertEqual(self.route("menu","a:2026-11-23",user),{"kind":"menu","week":"2026-11-23"})
            self.assertIsNone(self.route("menu","b:2026-11-23",user))
            self.assertIsNone(self.route("menu","a:2026-11-24",user))
            self.assertEqual(self.route("menu","a:2026-11-30",user),{"kind":"menu"})

    def test_archived_scope_and_personal_messages(self):
        self.assertIsNone(self.route("birthday"))
        self.assertIsNone(self.route("custom"))
        self.c.execute("UPDATE v2_chef_links SET archived_at='now'")
        self.assertIsNone(self.route("menu","a:2026-11-23",self.chef))
        self.c.execute("UPDATE v2_athletes SET archived_at='now'")
        self.assertIsNone(self.route("weight"))


if __name__=="__main__":
    unittest.main()
