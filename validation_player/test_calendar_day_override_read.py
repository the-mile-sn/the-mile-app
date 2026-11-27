"""Player branch: manual day nutritional selection is read but automatic chronology remains."""
import sqlite3
import unittest
import calendar_v2


class PlayerCalendarOverrideReadTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        self.c.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY)")
        self.c.execute("CREATE TABLE v2_calendar_events(athlete_id TEXT,event_date TEXT,kind TEXT)")
        self.c.execute("CREATE TABLE v2_day_meal_colors(athlete_id TEXT,meal_date TEXT,meal TEXT,color TEXT)")
        self.c.execute("INSERT INTO v2_athletes VALUES('p1')")
        calendar_v2.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def test_read_override_and_automatic_reset(self):
        originals=calendar_v2.classify_range("2026-11-09","2026-11-11",["2026-11-08"])
        days=calendar_v2.effective_days(self.c,"p1",originals)
        self.assertIsNone(days[-1]["classification"])
        self.c.execute("INSERT INTO v2_day_classification_overrides VALUES(?,?,?,?,?)",
                       ("p1","2026-11-11","Geral","admin",1))
        updated=calendar_v2.effective_days(self.c,"p1",originals)
        self.assertEqual(updated[-1]["classification"],"Geral")
        self.assertEqual(updated[-1]["classification_source"],"manual")
        self.assertEqual(updated[0]["classification"],"MD+1")
        self.c.execute("DELETE FROM v2_day_classification_overrides WHERE athlete_id='p1'")
        reset=calendar_v2.effective_days(self.c,"p1",originals)
        self.assertEqual(reset[-1]["classification_source"],"automatic")
        self.assertIsNone(reset[-1]["classification"])

    def test_nutritional_override_respects_manual_meal_colour(self):
        self.c.execute("INSERT INTO v2_day_classification_overrides VALUES(?,?,?,?,?)",
                       ("p1","2026-11-11","MD-4","admin",1))
        self.c.execute("INSERT INTO v2_day_meal_colors VALUES('p1','2026-11-11','lunch','yellow')")
        days=calendar_v2.effective_days(self.c,"p1",
            calendar_v2.classify_range("2026-11-11","2026-11-11",[]))
        model={"classifications":[{"name":"MD-4","meals":{"lunch":"blue"}}]}
        colors=calendar_v2.effective_colors(self.c,"p1",days,model)
        self.assertEqual(colors["2026-11-11"]["lunch"],{"color":"yellow","source":"manual"})


if __name__=="__main__":
    unittest.main()
