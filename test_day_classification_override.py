"""Date-only nutritional classification overrides preserve automatic match chronology."""
import sqlite3
import unittest
import calendar_v2


class DayClassificationOverrideTests(unittest.TestCase):
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

    def days(self):
        raw=calendar_v2.classify_range("2026-11-09","2026-11-11",["2026-11-08"])
        return calendar_v2.effective_days(self.c,"p1",raw)

    def test_auto_manual_and_reset_are_date_scoped(self):
        self.assertIsNone(self.days()[2]["classification"])
        saved=calendar_v2.set_day_classification(self.c,"p1","2026-11-11","Geral","admin")
        self.assertEqual(saved["source"],"manual")
        self.assertEqual(self.days()[2]["classification"],"Geral")
        self.assertEqual(self.days()[2]["classification_source"],"manual")
        self.assertEqual(self.days()[0]["classification"],"MD+1")
        calendar_v2.set_day_classification(self.c,"p1","2026-11-11",None,"admin")
        self.assertIsNone(self.days()[2]["classification"])
        self.assertEqual(self.days()[2]["classification_source"],"automatic")

    def test_manual_meal_color_wins_after_manual_day_choice(self):
        calendar_v2.set_day_classification(self.c,"p1","2026-11-11","MD-4","admin")
        self.c.execute("INSERT INTO v2_day_meal_colors VALUES('p1','2026-11-11','lunch','yellow')")
        model={"classifications":[
            {"name":"MD-4","meals":{"lunch":"blue"}},
            {"name":"Geral","meals":{"lunch":"green"}}]}
        colors=calendar_v2.effective_colors(self.c,"p1",self.days(),model)
        self.assertEqual(colors["2026-11-11"]["lunch"],{"color":"yellow","source":"manual"})

    def test_off_event_preserved_and_manual_choice_separate(self):
        self.c.execute("INSERT INTO v2_calendar_events VALUES('p1','2026-11-09','off')")
        self.assertEqual(self.days()[0]["classification"],"Off (+1)")
        calendar_v2.set_day_classification(self.c,"p1","2026-11-09","Geral","admin")
        day=self.days()[0]
        self.assertEqual(day["classification"],"Geral")
        self.assertEqual(day["temporal_classification"],"MD+1")
        self.assertEqual(day["automatic_classification"],"Off (+1)")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_calendar_events").fetchone()[0],1)

    def test_invalid_does_not_write(self):
        for value in ["2026-13-09","bad",None]:
            with self.assertRaises(ValueError):
                calendar_v2.set_day_classification(self.c,"p1",value,"Geral","admin")
        with self.assertRaises(ValueError):
            calendar_v2.set_day_classification(self.c,"p1","2026-11-09","MD+99","admin")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM v2_day_classification_overrides").fetchone()[0],0)


if __name__ == "__main__":
    unittest.main()
