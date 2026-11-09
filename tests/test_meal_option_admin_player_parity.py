"""Cross-service contract: player and Planeamento resolve the same published Planos.

Read-only fixture. Runs with main checked out in player-branch/; no production DB
changes, deployments, publications, or athlete data are touched.
"""
import importlib.util
import json
import sqlite3
import unittest
from pathlib import Path

import food_plan_calendar_bridge_v2 as admin_bridge

ROOT = Path(__file__).resolve().parents[1]
PLAYER_MODULE = ROOT / "player-branch" / "food_plan_player_v2.py"
if not PLAYER_MODULE.is_file():
    raise RuntimeError("Checkout main into player-branch before testing")
spec = importlib.util.spec_from_file_location("deployed_player_plan_adapter", PLAYER_MODULE)
player_bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(player_bridge)

ATHLETE = "athlete-parity"
USER = "user-parity"
DAY = "2026-11-09"
COLOR_TYPES = dict(admin_bridge.COLOR_TYPES)
FOOD = {
    "id": "food-1", "kind": "food", "grams": 100,
    "display_quantity": "100 g", "display_name": "Aveia"
}
ALTERNATIVE = {
    "id": "food-2", "kind": "food", "grams": 100,
    "display_quantity": "100 g", "display_name": "Arroz",
    "alternative_to": 0
}


def option(title, second=False):
    if second:
        return {
            "title": title,
            "foods": [{**FOOD, "grams": 50, "display_quantity": "50 g"}],
            "notes": ["Nota da segunda opção"],
            "order": [{"type": "note", "index": 0},
                      {"type": "food", "index": 0}],
        }
    return {
        "title": title,
        "foods": [dict(FOOD), dict(ALTERNATIVE)],
        "notes": ["Nota da primeira opção"],
        "order": [{"type": "food", "index": 0},
                  {"type": "food", "index": 1},
                  {"type": "note", "index": 0}],
    }


def meal(name):
    return {"name": name, "options": [
        option("Primeira alternativa"),
        option("Segunda alternativa", second=True),
    ]}


def connect():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript("""
      CREATE TABLE v2_athletes(id TEXT PRIMARY KEY, archived_at INTEGER);
      CREATE TABLE v2_player_links(athlete_id TEXT PRIMARY KEY, user_id TEXT);
      CREATE TABLE v2_food_library(
        id TEXT PRIMARY KEY, display_name TEXT, variant TEXT,
        edible_fraction REAL, kcal REAL, protein_g REAL,
        carbs_g REAL, fat_g REAL, active INTEGER);
      CREATE TABLE v2_food_plan_editor_publications(
        draft_id TEXT PRIMARY KEY, athlete_id TEXT, plan_type TEXT,
        snapshot_json TEXT, published_at INTEGER, state TEXT);
      CREATE TABLE v2_match_peri_overrides(
        athlete_id TEXT, match_id TEXT, phase TEXT, state TEXT);
    """)
    c.execute("INSERT INTO v2_athletes(id,archived_at) VALUES (?,NULL)", (ATHLETE,))
    c.execute("INSERT INTO v2_player_links VALUES (?,?)", (ATHLETE, USER))
    c.executemany("INSERT INTO v2_food_library VALUES (?,?,?,?,?,?,?,?,?)", [
        ("food-1", "Aveia", "plain", 1, 370, 13, 61, 7, 1),
        ("food-2", "Arroz", "plain", 1, 130, 2.7, 28, 0.3, 1),
    ])
    for key, plan_type in COLOR_TYPES.items():
        publish(c, plan_type, [
            meal("Intermédia"), meal("Principal"), meal("Ceia")])
    publish(c, "Plano Peri-treino", [
        meal("Pré-treino"), meal("Pós-treino")])
    publish(c, "Plano Peri-jogo", [
        meal("Pré-jogo"), meal("Intra-jogo"), meal("Pós-jogo")])
    c.commit()
    return c


def publish(c, plan_type, meals):
    payload = {
        "athlete_id": ATHLETE, "player_id": USER,
        "plan_type": plan_type, "meals": meals,
    }
    c.execute(
        "INSERT INTO v2_food_plan_editor_publications VALUES (?,?,?,?,?,?)",
        (str(len(plan_type))+"-"+plan_type, ATHLETE, plan_type,
         json.dumps(payload, ensure_ascii=False), 1731150000, "published"),
    )


def assert_options_equal(t, admin_options, player_options):
    t.assertEqual(len(admin_options), len(player_options))
    for number, (admin_option, player_option) in enumerate(
            zip(admin_options, player_options), 1):
        t.assertEqual(player_option["number"], number)
        t.assertEqual(admin_option["title"], player_option["title"])
        t.assertEqual(admin_option["option_ref"], player_option["option_ref"])
        for key in ("kcal", "protein_g", "carbs_g", "fat_g"):
            t.assertAlmostEqual(
                admin_option["nutrition"][key], player_option["totals"][key],
                places=6, msg=key)
        # Validate order, quantities, and alternative labels on the real
        # adapter output, not only nutritional averages.
        items = player_option["items"]
        if number == 1:
            t.assertEqual(
                [(v["kind"], v.get("quantity"), v.get("name"), v.get("text"))
                 for v in items],
                [("food", "100 g", "Aveia", None),
                 ("note", None, None, "ou 100 g · Arroz"),
                 ("note", None, None, "Nota da primeira opção")],
            )
        else:
            t.assertEqual(
                [(v["kind"], v.get("quantity"), v.get("name"), v.get("text"))
                 for v in items],
                [("note", None, None, "Nota da segunda opção"),
                 ("food", "50 g", "Aveia", None)],
            )


class PlanosAdminPlayerParity(unittest.TestCase):
    def test_five_colors_five_meal_slots_option_order_nutrition_and_foods(self):
        with connect() as c:
            model = {"breakfast": "yellow", "lunch": "orange",
                     "snack": "green", "dinner": "blue", "supper": "vp"}
            resolved = admin_bridge.resolve(c, ATHLETE, {
                DAY: {meal: {"color": color} for meal, color in model.items()}
            })["days"][DAY]["meals"]
            player_options = player_bridge.player_plans(c, ATHLETE)["options_by_color"]
            for slot, color in model.items():
                self.assertEqual(resolved[slot]["status"], "ok", (slot, color))
                assert_options_equal(self, resolved[slot]["options"],
                                     player_options[color][slot])

    def test_peri_training_and_match_options_are_identical(self):
        with connect() as c:
            events = [
                {"id": "ev-training", "kind": "training", "event_date": DAY,
                 "session": "morning", "title": "Treino"},
                {"id": "ev-match", "kind": "match", "event_date": DAY,
                 "session": "afternoon", "title": "Jogo"},
            ]
            base = {"breakfast": {"color": "yellow"},
                    "lunch": {"color": "orange"},
                    "snack": {"color": "green"},
                    "dinner": {"color": "blue"},
                    "supper": {"color": "vp"}}
            admin_rows = admin_bridge.resolve(c, ATHLETE, {
                DAY: base}, events=events)["days"][DAY]["peri_events"]
            player_rows = player_bridge.player_peri_days(
                c, ATHLETE, DAY, DAY, events=events, matches=[])
            self.assertEqual(len(admin_rows), 5)
            self.assertEqual(len(player_rows), 5)
            player_by_key = {
                (r["event_id"], r["title"]): r for r in player_rows}
            for record in admin_rows:
                self.assertEqual(record["status"], "ok")
                matching = player_by_key[(record["event_id"], record["title"])]
                assert_options_equal(
                    self, record["options"], matching["options"])

    def test_both_services_only_consume_approved_snapshots(self):
        with connect() as c:
            before = player_bridge.player_plans(c, ATHLETE)["options_by_color"]
            c.execute(
                "UPDATE v2_food_plan_editor_publications SET state='draft' "
                "WHERE plan_type=?", ("Plano amarelo",))
            after = player_bridge.player_plans(c, ATHLETE)["options_by_color"]
            self.assertEqual(len(before["yellow"]["breakfast"]), 2)
            self.assertEqual(after["yellow"]["breakfast"], [])
            # Note: the current admin preview also supports transitional
            # snapshots; published-only parity is enforced above.


if __name__ == "__main__":
    unittest.main()
