"""Regression coverage for free-text menus and legacy SQLite records."""
import sqlite3
import unittest
import microcycles_v2


class FreeTextMenuTests(unittest.TestCase):
    def test_legacy_menu_survives_upgrade_and_text_keeps_line_breaks(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
        c.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at BIGINT NOT NULL)")
        c.execute("INSERT INTO v2_athletes VALUES ('p1','Athlete',0)")
        c.execute("""CREATE TABLE v2_weekly_menus (
            athlete_id TEXT NOT NULL REFERENCES v2_athletes(id),
            menu_date TEXT NOT NULL,
            meal TEXT NOT NULL CHECK(meal IN ('lunch','dinner')),
            kind TEXT NOT NULL CHECK(kind IN ('category','dish')),
            value TEXT NOT NULL,
            dish_id TEXT,
            PRIMARY KEY (athlete_id,menu_date,meal)
        )""")
        c.execute("INSERT INTO v2_weekly_menus VALUES ('p1','2026-11-10','lunch','category','Carne branca',NULL)")
        microcycles_v2.initialize(c)
        self.assertEqual(c.execute("SELECT value FROM v2_weekly_menus WHERE menu_date='2026-11-10'").fetchone()["value"], "Carne branca")
        menu = "Ementa do CT:\n• Peixe grelhado com arroz\n• Frango com batata e legumes"
        saved = microcycles_v2.save_menu(c, "p1", "2026-11-12", "dinner", "text", menu)
        self.assertEqual(saved["value"], menu)
        self.assertIsNone(c.execute("SELECT dish_id FROM v2_weekly_menus WHERE menu_date='2026-11-12'").fetchone()["dish_id"])
        listed = microcycles_v2.list_menus(c, "p1", "2026-11-10", "2026-11-12")
        self.assertEqual([row["kind"] for row in listed], ["category", "text"])
        self.assertEqual(listed[1]["value"], menu)
        microcycles_v2.initialize(c)
        self.assertEqual(microcycles_v2.list_menus(c, "p1", "2026-11-12", "2026-11-12")[0]["value"], menu)
        with self.assertRaises(ValueError):
            microcycles_v2.save_menu(c, "p1", "2026-11-13", "dinner", "text", "x" * 2001)
        c.close()


if __name__ == "__main__":
    unittest.main()
