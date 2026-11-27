"""Synthetic SQLite integration tests; never connect to a live database."""
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone, date

from notification_store_v2 import initialize, record_content_change
from notification_sources_v2 import (
    document_assessment_inventory, recent_document_assessment_candidates,
    form_candidates, weekly_menu_snapshot, birthday_candidates, custom_recipients,
)


class SourceTests(unittest.TestCase):
    now = datetime(2026, 11, 27, 14, tzinfo=timezone.utc)

    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
            CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER,
                menus_enabled INTEGER,anthropometry_enabled INTEGER);
            CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,archived_at INTEGER);
            CREATE TABLE v2_player_links(user_id TEXT,athlete_id TEXT);
            CREATE TABLE v2_chef_links(user_id TEXT,athlete_id TEXT,archived_at INTEGER);
            CREATE TABLE documents(id TEXT,user_id TEXT,folder TEXT,title TEXT,data BLOB);
            CREATE TABLE v2_body_assessments(id TEXT,athlete_id TEXT,assessed_on TEXT,
                measurements TEXT,averages TEXT,formula_note TEXT,status TEXT);
            CREATE TABLE v2_daily_weighins(athlete_id TEXT,weigh_date TEXT);
            CREATE TABLE v2_match_events(id TEXT,athlete_id TEXT,match_date TEXT);
            CREATE TABLE v2_post_match_responses(athlete_id TEXT,match_id TEXT);
            CREATE TABLE v2_weekly_menus(athlete_id TEXT,menu_date TEXT,meal TEXT,
                kind TEXT,value TEXT,dish_id TEXT);
            INSERT INTO users VALUES
                ('p','Player','player',1,0,0),('q','Other','player',1,1,1),
                ('chef','Chef','chef',1,0,0),('admin','Admin','admin',1,0,0);
            INSERT INTO v2_athletes VALUES ('a',NULL),('b',NULL);
            INSERT INTO v2_player_links VALUES ('p','a'),('q','b');
            INSERT INTO v2_chef_links VALUES ('chef','a',NULL);
            INSERT INTO documents VALUES
                ('d','p','nutrition','Visible',X'0102'),
                ('w','p','weekly','Microcycle',X'01'),
                ('hidden','p','menus','Hidden',X'01'),
                ('other','q','other','Other athlete',X'01');
            INSERT INTO v2_body_assessments VALUES
                ('s','a','2026-11-20','{"weight":70}','{}','','published'),
                ('draft','a','2026-11-22','{}','{}','','draft');
            INSERT INTO v2_match_events VALUES
                ('old','a','2026-11-20'),('latest','a','2026-11-25');
            INSERT INTO v2_weekly_menus VALUES
                ('a','2026-11-23','lunch','dish','Old label','dish1'),
                ('a','2026-11-24','dinner','text','Rice',NULL);
        """)
        initialize(self.c)

    def tearDown(self):
        self.c.close()

    def inventory(self):
        return document_assessment_inventory(self.c, authorised_athlete_ids=['a'])

    def recent(self):
        return recent_document_assessment_candidates(
            self.c, authorised_athlete_ids=['a'],
            since=self.now-timedelta(days=7), now=self.now)

    def test_scope_visibility_and_no_false_publications(self):
        self.assertEqual({i["target_id"] for i in self.inventory()}, {"d","s"})
        self.assertEqual(self.recent(), [])

    def test_verified_update_and_noop(self):
        item = next(i for i in self.inventory() if i["target_id"]=="d")
        previous = item["version"]
        self.c.execute("UPDATE documents SET title='Changed' WHERE id='d'")
        item = next(i for i in self.inventory() if i["target_id"]=="d")
        self.assertNotEqual(previous,item["version"])
        args = dict(recipient_id="p",kind="document",target_id="d",
                    current_version=item["version"],changed_at=int(self.now.timestamp()))
        self.assertFalse(record_content_change(self.c,previous_version=item["version"],**args))
        self.assertTrue(record_content_change(self.c,previous_version=previous,**args))
        self.assertFalse(record_content_change(self.c,previous_version=previous,**args))
        self.assertEqual(self.recent()[0]["change_kind"],"updated")
        self.c.execute("UPDATE documents SET title='Changed again' WHERE id='d'")
        self.assertEqual(self.recent(), [])

    def test_form_sources_and_scope(self):
        self.assertEqual([r["target_id"] for r in form_candidates(
            self.c,authorised_athlete_ids=["a"],kind="game",now=self.now)],["latest"])
        self.c.execute("INSERT INTO v2_post_match_responses VALUES ('a','latest')")
        self.assertEqual(form_candidates(self.c,authorised_athlete_ids=["a"],
                                         kind="game",now=self.now),[])
        self.assertEqual([r["recipient_id"] for r in form_candidates(
            self.c,authorised_athlete_ids=["a"],kind="weight",now=self.now)],["p"])
        self.c.execute("INSERT INTO v2_daily_weighins VALUES ('a','2026-11-26')")
        self.assertEqual(form_candidates(self.c,authorised_athlete_ids=["a"],
                                         kind="weight",now=self.now),[])

    def test_birthday_and_custom_scope(self):
        self.c.execute("ALTER TABLE users ADD COLUMN birth_date TEXT")
        self.c.execute("UPDATE users SET birth_date='2000-11-27' WHERE id IN ('p','q')")
        def birthdays():
            return birthday_candidates(self.c,authorised_athlete_ids=["a"],now=self.now)
        self.assertEqual([(r["recipient_id"],r["first_name"],r["target_id"])
                          for r in birthdays()], [("p","Player","birthday:2026")])
        self.c.execute("""INSERT INTO v2_manual_notifications
            (id,request_id,recipient_id,sender_id,kind,language,title,body,target_id,created_at)
            VALUES('b1','r1','p','admin','birthday','pt-PT','Title','Body','birthday:2026',100)""")
        self.assertEqual(birthdays(),[])
        self.assertEqual({r["recipient_id"] for r in custom_recipients(
            self.c,authorised_athlete_ids=["a"])},{"p","chef"})
        self.c.execute("UPDATE v2_chef_links SET archived_at=100 WHERE user_id='chef'")
        self.assertEqual({r["recipient_id"] for r in custom_recipients(
            self.c,authorised_athlete_ids=["a"])},{"p"})

    def test_menu_week_and_linked_recipients(self):
        def snapshot():
            return weekly_menu_snapshot(self.c,athlete_id="a",
                week_start=date(2026,11,23),authorised_athlete_ids=["a"])
        original=snapshot()
        self.assertEqual(original["meal_count"],2)
        self.assertEqual({r["recipient_id"] for r in original["recipients"]},{"p","chef"})
        self.c.execute("UPDATE v2_weekly_menus SET value='New label' WHERE dish_id='dish1'")
        self.assertEqual(snapshot()["version"],original["version"])
        self.c.execute("UPDATE v2_weekly_menus SET value='Pasta' WHERE kind='text'")
        self.assertNotEqual(snapshot()["version"],original["version"])
        with self.assertRaises(PermissionError):
            weekly_menu_snapshot(self.c,athlete_id="b",week_start=date(2026,11,23),
                                 authorised_athlete_ids=["a"])


if __name__ == "__main__":
    unittest.main()
