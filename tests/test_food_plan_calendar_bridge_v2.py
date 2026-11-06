"""Regression tests for read-only Planos -> Planeamento nutrition bridge.

Run: python -m unittest discover -s tests -p 'test_food_plan_calendar_bridge_v2.py'
No database writes outside in-memory fixtures and no player app changes.
"""
import json
import sqlite3
import unittest

from food_plan_calendar_bridge_v2 import option_values, slots, resolve

MACROS = ("kcal", "protein_g", "carbs_g", "fat_g")


def food(fid, grams, **extra):
    return {"id": fid, "grams": grams, **extra}


def option(*foods):
    return {"title": "", "foods": list(foods), "notes": [], "order": []}


def meal(name, *options):
    return {"name": name, "options": list(options)}


def draft(athlete_id="a1", user_id="u1", kind="Plano amarelo", meals=None):
    return {"name": "Plano", "plan_type": kind, "athlete_id": athlete_id,
            "player_id": user_id, "meals": meals or []}


class BridgeNutritionTests(unittest.TestCase):
    def setUp(self):
        self.library = {
            "pao": dict(id="pao", variant="plain", edible_fraction=1.0,
                        kcal=250.0, protein_g=10.0, carbs_g=50.0, fat_g=2.0,
                        display_name="Pão"),
            "fruta": dict(id="fruta", variant="gross", edible_fraction=0.8,
                          kcal=100.0, protein_g=2.0, carbs_g=20.0, fat_g=1.0,
                          display_name="Fruta"),
        }
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
            CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, archived_at TEXT);
            CREATE TABLE v2_player_links (athlete_id TEXT, user_id TEXT);
            CREATE TABLE v2_food_plan_drafts (id TEXT, content TEXT, updated_at INTEGER);
            CREATE TABLE v2_food_library (
              id TEXT, display_name TEXT, active INTEGER, variant TEXT, edible_fraction REAL,
              kcal REAL, protein_g REAL, carbs_g REAL, fat_g REAL);
            INSERT INTO v2_athletes(id,archived_at) VALUES ('a1',NULL),('a2',NULL);
            INSERT INTO v2_player_links VALUES ('a1','u1'),('a2','u2');
        """)
        for item in self.library.values():
            self.c.execute(
                "INSERT INTO v2_food_library VALUES (?,?,?,?,?,?,?,?,?)",
                (item["id"], item["display_name"], 1, item["variant"],
                 item["edible_fraction"], *[item[k] for k in MACROS])
            )

    def add(self, value, ident="d1"):
        self.c.execute("INSERT INTO v2_food_plan_drafts VALUES (?,?,?)",
                       (ident, json.dumps(value), 12345))

    def test_grams_fraction_and_macros(self):
        values, pending = option_values(option(food("pao", 80), food("fruta", 100)), self.library)
        # 80 g bread = 200 kcal; 100 g gross fruit at 80% edible = 80 kcal.
        self.assertAlmostEqual(values["kcal"], 280)
        self.assertAlmostEqual(values["protein_g"], 9.6)
        self.assertAlmostEqual(values["carbs_g"], 56)
        self.assertAlmostEqual(values["fat_g"], 2.4)
        self.assertFalse(pending)

    def test_alternatives_are_averaged_not_added(self):
        values, pending = option_values(
            option(food("pao", 80), food("fruta", 100, alternative_to=0)), self.library)
        self.assertAlmostEqual(values["kcal"], 140)  # (200+80)/2
        self.assertAlmostEqual(values["protein_g"], 4.8)
        self.assertFalse(pending)

    def test_missing_alternative_is_provisional(self):
        values, pending = option_values(
            option(food("pao", 80), food("fruta", None, alternative_to=0)), self.library)
        self.assertTrue(pending)
        self.assertAlmostEqual(values["kcal"], 200)

    def test_unknown_food_is_provisional(self):
        values, pending = option_values(option(food("missing", 100)), self.library)
        self.assertTrue(pending)
        self.assertEqual(values["kcal"], 0)

    def test_shared_meal_mapping(self):
        self.assertEqual(slots({"name": "Pequeno almoço / lanche"}), ("breakfast", "snack"))
        self.assertEqual(slots({"name": "Almoço / jantar"}), ("lunch", "dinner"))
        self.assertEqual(slots({"name": "Intermédia"}), ("breakfast", "snack"))
        self.assertEqual(slots({"name": "Principal"}), ("lunch", "dinner"))

    def test_effective_day_uses_correct_athlete_and_slot(self):
        self.add(draft(meals=[meal("Pequeno almoço / lanche", option(food("pao", 80)))]))
        self.add(draft(athlete_id="a2", user_id="u2",
                       meals=[meal("Pequeno almoço", option(food("pao", 200)))]), "d2")
        day = "2026-11-06"
        result = resolve(self.c, "a1", {
            day: {"breakfast": {"color": "yellow", "source": "model"},
                  "snack": {"color": "yellow", "source": "manual"}}})
        cells = result["days"][day]["meals"]
        self.assertEqual(cells["breakfast"]["status"], "ok")
        self.assertEqual(cells["snack"]["status"], "ok")
        self.assertEqual(cells["breakfast"]["nutrition"]["kcal"], 200)
        self.assertEqual(cells["snack"]["nutrition"]["kcal"], 200)
        self.assertEqual(result["days"][day]["nutrition"]["kcal"], 400)
        self.assertEqual(result["days"][day]["peri_included"], False)

    def test_two_options_meal_average(self):
        self.add(draft(meals=[meal("Pequeno almoço", option(food("pao", 80)),
                                  option(food("pao", 120)))]))
        result = resolve(self.c, "a1", {
            "2026-11-06": {"breakfast": {"color": "yellow"}}})
        self.assertEqual(result["days"]["2026-11-06"]["meals"]["breakfast"]["nutrition"]["kcal"], 250)

    def test_duplicate_drafts_are_not_chosen_automatically(self):
        value = draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))])
        self.add(value, "d1")
        self.add(value, "d2")
        result = resolve(self.c, "a1", {"2026-11-06": {"breakfast": {"color": "yellow"}}})
        self.assertEqual(result["days"]["2026-11-06"]["meals"]["breakfast"]["status"],
                         "ambiguous_plan")

    def test_missing_meal_is_flagged(self):
        self.add(draft(meals=[meal("Ceia", option(food("pao", 80)))]))
        result = resolve(self.c, "a1", {"2026-11-06": {"breakfast": {"color": "yellow"}}})
        self.assertEqual(result["days"]["2026-11-06"]["meals"]["breakfast"]["status"],
                         "missing_meal")

    def test_wrong_account_link_never_crosses_athletes(self):
        self.add(draft(athlete_id="a1", user_id="u2",
                       meals=[meal("Pequeno almoço", option(food("pao", 80)))]))
        result = resolve(self.c, "a1", {"2026-11-06": {"breakfast": {"color": "yellow"}}})
        self.assertEqual(result["days"]["2026-11-06"]["meals"]["breakfast"]["status"],
                         "missing_plan")

    def tearDown(self):
        self.c.close()


if __name__ == "__main__":
    unittest.main()
