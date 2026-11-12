"""Weekly dashboard shares effective classifications and nutrition precedence."""
import sqlite3
import unittest

import calendar_v2
import dashboard_v2


class DashboardEffectiveDayTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY)")
        self.c.execute("CREATE TABLE v2_calendar_events(athlete_id TEXT,event_date TEXT,kind TEXT)")
        self.c.execute("CREATE TABLE v2_day_meal_colors(athlete_id TEXT,meal_date TEXT,meal TEXT,color TEXT)")
        self.c.execute("INSERT INTO v2_athletes VALUES('p1')")
        calendar_v2.initialize(self.c)
        self.model={"classifications":[
            {"name":"Geral","meals":{"breakfast":"yellow","lunch":"green"}},
            {"name":"Off","meals":{"breakfast":"blue","lunch":"yellow"}},
            {"name":"Off (+1)","meals":{"breakfast":"green","lunch":"orange"}},
            {"name":"Off (+2)","meals":{"breakfast":"orange","lunch":"blue"}},
            {"name":"MD+1","meals":{"breakfast":"yellow","lunch":"yellow"}},
            {"name":"MD+2","meals":{"breakfast":"orange","lunch":"orange"}},
        ]}

    def tearDown(self):
        self.c.close()

    def week(self,matches=None,manual=None):
        return dashboard_v2.resolved_week_days(
            self.c,"p1","2026-11-09","2026-11-15",matches or [],
            self.model, manual or {}, {}, [], "2026-11-12")

    def test_unassigned_day_uses_general_with_its_model_colours(self):
        day=self.week()[0]
        self.assertEqual(day["classification"],"Geral")
        self.assertEqual(day["classification_source"],"automatic")
        self.assertEqual(day["colors"]["breakfast"],"yellow")
        self.assertEqual(day["colors"]["lunch"],"green")

    def test_off_and_off_variants_from_events_preserve_auto_md(self):
        matches=[{"id":"game1","match_date":"2026-11-08"}]
        for day in ["2026-11-09","2026-11-10","2026-11-13"]:
            self.c.execute("INSERT INTO v2_calendar_events VALUES('p1',?,'off')",(day,))
        rows=self.week(matches)
        self.assertEqual(rows[0]["classification"],"Off (+1)")
        self.assertEqual(rows[0]["colors"]["lunch"],"orange")
        self.assertEqual(rows[1]["classification"],"Off (+2)")
        self.assertEqual(rows[1]["colors"]["lunch"],"blue")
        self.assertEqual(rows[4]["classification"],"Off")
        self.assertEqual(rows[4]["colors"]["breakfast"],"blue")
        self.assertTrue(rows[4]["is_off"])

    def test_manual_day_precedence_over_auto_and_manual_meal_colour(self):
        self.c.execute("""INSERT INTO v2_day_classification_overrides
                          VALUES('p1','2026-11-09','Geral','admin',1)""")
        matches=[{"id":"game1","match_date":"2026-11-08"}]
        day=self.week(matches,{("2026-11-09","lunch"):"blue"})[0]
        self.assertEqual(day["classification"],"Geral")
        self.assertEqual(day["classification_source"],"manual")
        self.assertEqual(day["colors"]["breakfast"],"yellow")
        self.assertEqual(day["colors"]["lunch"],"blue")

    def test_manual_off_without_event_uses_off_palette(self):
        self.c.execute("""INSERT INTO v2_day_classification_overrides
                          VALUES('p1','2026-11-09','Off','admin',1)""")
        day=self.week()[0]
        self.assertTrue(day["is_off"])
        self.assertEqual(day["classification"],"Off")
        self.assertEqual(day["colors"]["breakfast"],"blue")


if __name__=="__main__":
    unittest.main()
