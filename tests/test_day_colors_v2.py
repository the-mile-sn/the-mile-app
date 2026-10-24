"""Tests for one-day meal color exceptions in the v2 calendar."""
import sqlite3
import unittest
from datetime import date, timedelta
import day_colors_v2

class DayMealColorsTest(unittest.TestCase):
    def setUp(self):
        self.conn=sqlite3.connect(":memory:")
        self.conn.row_factory=sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY)")
        self.conn.execute("INSERT INTO v2_athletes VALUES ('a')")
        self.conn.execute("INSERT INTO v2_athletes VALUES ('b')")
        day_colors_v2.initialize(self.conn)
        self.day=(date.today()+timedelta(days=2)).isoformat()

    def tearDown(self):
        self.conn.close()

    def test_one_meal_one_date_one_player_only(self):
        result=day_colors_v2.set_color(self.conn,"a",self.day,"dinner","blue","admin")
        self.assertEqual(result["color"],"blue")
        self.assertEqual(day_colors_v2.list_colors(self.conn,"a",self.day,self.day),
                         [{"meal_date":self.day,"meal":"dinner","color":"blue"}])
        self.assertEqual(day_colors_v2.list_colors(self.conn,"b",self.day,self.day),[])
        later=(date.fromisoformat(self.day)+timedelta(days=1)).isoformat()
        self.assertEqual(day_colors_v2.list_colors(self.conn,"a",later,later),[])
        self.assertEqual(day_colors_v2.list_colors(self.conn,"a",self.day,self.day)[0]["meal"],"dinner")

    def test_replace_and_restore_model(self):
        day_colors_v2.set_color(self.conn,"a",self.day,"dinner","blue","admin")
        day_colors_v2.set_color(self.conn,"a",self.day,"dinner","yellow","admin")
        self.assertEqual(day_colors_v2.list_colors(self.conn,"a",self.day,self.day)[0]["color"],"yellow")
        day_colors_v2.set_color(self.conn,"a",self.day,"dinner",None,"admin")
        self.assertEqual(day_colors_v2.list_colors(self.conn,"a",self.day,self.day),[])

    def test_invalid_values_rejected(self):
        for kwargs in (dict(meal="not-a-meal",color="blue"),
                       dict(meal="dinner",color="invalid")):
            with self.assertRaises(ValueError):
                day_colors_v2.set_color(self.conn,"a",self.day,kwargs["meal"],kwargs["color"],"admin")
        self.assertIsNone(day_colors_v2.set_color(self.conn,"missing",self.day,"dinner","blue","admin"))

if __name__=="__main__":
    unittest.main()
