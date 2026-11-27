"""Verify real chef save/review paths against a synthetic SQLite schema."""
import sqlite3
import unittest
from datetime import date
from unittest.mock import patch

import chef_collaboration_v2 as chef
import notification_capture_v2 as capture
from notification_store_v2 import initialize
from notification_admin_preview_v2 import preview
from datetime import datetime,timezone


class ChefCaptureTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("PRAGMA foreign_keys=ON")
        self.c.executescript("""
            CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER);
            CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,archived_at TEXT);
            CREATE TABLE v2_player_links(user_id TEXT,athlete_id TEXT);
            CREATE TABLE v2_chef_links(user_id TEXT,athlete_id TEXT,archived_at TEXT);
            CREATE TABLE v2_weekly_menus(athlete_id TEXT,menu_date TEXT,meal TEXT,kind TEXT,value TEXT,dish_id TEXT,
                PRIMARY KEY(athlete_id,menu_date,meal));
            CREATE TABLE v2_dish_library(id TEXT PRIMARY KEY,name_pt TEXT,active INTEGER);
            INSERT INTO users VALUES('p','Player','player',1),('c','Chef','chef',1),('admin','Admin','admin',1);
            INSERT INTO v2_athletes VALUES('a',NULL);
            INSERT INTO v2_player_links VALUES('p','a');
            INSERT INTO v2_chef_links VALUES('c','a',NULL);
            INSERT INTO v2_dish_library VALUES('dish','Approved dish',1);
        """)
        initialize(self.c)
        chef.initialize(self.c)
        self.c.commit()
        self.today=date(2026,11,27)
        self.now=datetime(2026,11,27,12,tzinfo=timezone.utc)
        self.env=patch.dict("os.environ",{"MILE_NOTIFICATIONS_CAPTURE":"1"})
        self.clock=patch.object(capture.time,"time",return_value=self.now.timestamp())
        self.env.start()
        self.clock.start()

    def tearDown(self):
        self.clock.stop()
        self.env.stop()
        self.c.close()

    def items(self):
        return preview(self.c,authorised_athlete_ids=["a"],kind="menu",now=self.now)["items"]

    def test_chef_save_and_noop(self):
        chef.save_menu(self.c,"a","c","2026-11-30","lunch","category","Carne branca",today=self.today)
        self.assertEqual({(i["recipient_id"],i["change_kind"]) for i in self.items()},
                         {("p","new"),("c","new")})
        count=self.c.execute("SELECT COUNT(*) FROM v2_notification_content_changes").fetchone()[0]
        unchanged=chef.save_menu(self.c,"a","c","2026-11-30","lunch","category","Carne branca",today=self.today)
        self.assertFalse(unchanged["changed"])
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_notification_content_changes").fetchone()[0],count)

    def test_proposal_only_captured_after_approval(self):
        chef.propose_dish(self.c,"a","c","2026-11-30","lunch","Suggested dish",today=self.today)
        self.assertEqual(self.items(),[])
        audit=self.c.execute("SELECT id FROM v2_chef_menu_audit").fetchone()["id"]
        chef.review(self.c,audit,"admin","approved","dish")
        self.assertEqual({i["recipient_id"] for i in self.items()},{"p","c"})

    def test_execution_and_review_do_not_create_changes(self):
        chef.save_menu(self.c,"a","c","2026-11-30","lunch","category","Carne branca",today=self.today)
        count=self.c.execute("SELECT COUNT(*) FROM v2_notification_content_changes").fetchone()[0]
        chef.record_execution(self.c,"a","c","2026-11-30","lunch","served_planned")
        audit=self.c.execute("SELECT id FROM v2_chef_menu_audit WHERE action='plan_updated'").fetchone()["id"]
        chef.review(self.c,audit,"admin","reviewed")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_notification_content_changes").fetchone()[0],count)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_manual_notifications").fetchone()[0],0)


if __name__=="__main__":
    unittest.main()
