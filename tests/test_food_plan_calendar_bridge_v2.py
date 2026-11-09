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
    return {"title": "", "foods": list(foods), "notes": [], "order": [{"type":"food","index":i} for i in range(len(foods))]}


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
            CREATE TABLE v2_food_plan_editor_publications (
                draft_id TEXT PRIMARY KEY, athlete_id TEXT, plan_type TEXT,
                snapshot_json TEXT, published_at INTEGER, state TEXT);
            CREATE UNIQUE INDEX editor_one_per_kind ON
                v2_food_plan_editor_publications(athlete_id,plan_type);
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

    def add(self, value, ident="d1", active=True):
        self.c.execute("INSERT INTO v2_food_plan_drafts VALUES (?,?,?)",
                       (ident, json.dumps(value), 12345))
        if active:
            self.c.execute(
                "INSERT INTO v2_food_plan_editor_publications VALUES (?,?,?,?,?,?)",
                (ident, value["athlete_id"], value["plan_type"], json.dumps(value),
                 12345, "transitional"))

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

    def test_new_working_copy_does_not_replace_approved_plan(self):
        value = draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))])
        self.add(value, "d1")
        self.add(draft(meals=[meal("Pequeno almoço", option(food("pao", 300)))]),
                 "d2", active=False)
        result = resolve(self.c, "a1", {"2026-11-06": {"breakfast": {"color": "yellow"}}})
        self.assertEqual(result["days"]["2026-11-06"]["meals"]["breakfast"]["status"], "ok")
        self.assertEqual(result["days"]["2026-11-06"]["nutrition"]["kcal"], 200)

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

    def test_training_post_is_added_once_to_color_nutrition(self):
        self.add(draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))]), "yellow")
        self.add(draft(kind="Plano Peri-treino",
                       meals=[meal("Pós treino", option(food("fruta", 100)))]), "peri")
        day = "2026-11-06"
        event = {"id": "t1", "kind": "training", "event_date": day,
                 "session": "morning", "pre_override": "auto", "post_override": "auto"}
        result = resolve(self.c, "a1", {day: {"breakfast": {"color": "yellow"}}},
                         events=[event])
        report = result["days"][day]
        self.assertAlmostEqual(report["nutrition"]["kcal"], 280)
        self.assertAlmostEqual(report["color_nutrition"]["kcal"], 200)
        self.assertAlmostEqual(report["peri_nutrition"]["kcal"], 80)
        self.assertTrue(report["peri_included"])
        self.assertEqual(len(report["peri_events"]), 1)
        self.assertEqual(report["peri_events"][0]["phase"], "post_training")

    def test_pre_and_post_training_are_distinct_phases(self):
        self.add(draft(kind="Plano Peri-treino", meals=[
            meal("Pré-treino", option(food("pao", 80))),
            meal("Pós-treino", option(food("fruta", 100)))]), "peri")
        day = "2026-11-06"
        e = {"id": "t1", "kind": "training", "event_date": day,
             "session": "afternoon", "pre_override": "auto", "post_override": "auto"}
        report = resolve(self.c, "a1", {day: {}}, events=[e])["days"][day]
        self.assertEqual({r["phase"] for r in report["peri_events"]},
                         {"pre_training", "post_training"})
        self.assertAlmostEqual(report["peri_nutrition"]["kcal"], 280)

    def test_post_training_off_excludes_post_nutrients(self):
        self.add(draft(kind="Plano Peri-treino",
                       meals=[meal("Pós treino", option(food("pao", 80)))]), "peri")
        day = "2026-11-06"
        report = resolve(self.c, "a1", {day: {}}, events=[{
            "id": "t1", "kind": "training", "event_date": day, "session": "morning",
            "pre_override": "auto", "post_override": "off"}])["days"][day]
        self.assertEqual(report["peri_nutrition"]["kcal"], 0)
        self.assertEqual(report["peri_events"], [])

    def test_match_intra_is_included_once_even_when_both_sources_exist(self):
        self.add(draft(kind="Plano Peri-jogo",
                       meals=[meal("Intra Jogo", option(food("pao", 80)))]), "peri")
        day = "2026-11-06"
        calendar_match = {"id": "calendar_match", "kind": "match",
                          "event_date": day, "session": "morning",
                          "pre_override": "auto", "post_override": "auto"}
        official_match = {"id": "official_match", "match_date": day, "match_time": "10:00"}
        report = resolve(self.c, "a1", {day: {}}, events=[calendar_match],
                         matches=[official_match])["days"][day]
        self.assertAlmostEqual(report["peri_nutrition"]["kcal"], 200)
        self.assertEqual(len(report["peri_events"]), 1)
        self.assertEqual(report["peri_events"][0]["phase"], "intra_match")
        self.assertTrue(report["peri_events"][0]["deduplicated_match_source"])

    def test_match_intra_pre_flag_off_skips_the_protocol(self):
        self.add(draft(kind="Plano Peri-jogo",
                       meals=[meal("Intra-jogo", option(food("pao", 80)))]), "peri")
        day = "2026-11-06"
        report = resolve(self.c, "a1", {day: {}}, events=[{
            "id": "m1", "kind": "match", "event_date": day, "session": "morning",
            "pre_override": "off", "post_override": "auto"}])["days"][day]
        self.assertEqual(report["peri_nutrition"]["kcal"], 0)

    def test_independent_training_events_have_independent_prescriptions(self):
        self.add(draft(kind="Plano Peri-treino",
                       meals=[meal("Pós-treino", option(food("pao", 80)))]), "peri")
        day = "2026-11-06"
        events = [{"id": x, "kind": "training", "event_date": day, "session": session,
                   "pre_override": "auto", "post_override": "auto"}
                  for x, session in (("morning", "morning"), ("afternoon", "afternoon"))]
        report = resolve(self.c, "a1", {day: {}}, events=events)["days"][day]
        self.assertAlmostEqual(report["peri_nutrition"]["kcal"], 400)
        self.assertEqual(len(report["peri_events"]), 2)

    def test_peri_without_plan_is_not_invented(self):
        day = "2026-11-06"
        event = {"id": "m1", "kind": "match", "event_date": day, "session": "morning",
                 "pre_override": "auto", "post_override": "auto"}
        report = resolve(self.c, "a1", {day: {}}, events=[event])["days"][day]
        self.assertEqual(report["peri_events"], [])
        self.assertEqual(report["peri_nutrition"]["kcal"], 0)

    def test_unknown_peri_phase_is_reported_not_silently_included(self):
        self.add(draft(kind="Plano Peri-jogo",
                       meals=[meal("Intervalo", option(food("pao", 80)))]), "peri")
        day = "2026-11-06"
        event = {"id": "m1", "kind": "match", "event_date": day, "session": "morning",
                 "pre_override": "auto", "post_override": "auto"}
        report = resolve(self.c, "a1", {day: {}}, events=[event])["days"][day]
        self.assertEqual(report["state"], "partial")
        self.assertEqual(report["peri_nutrition"]["kcal"], 0)
        self.assertEqual(report["issues"][0]["status"], "unmapped_peri_meal")

    def test_peri_missing_quantity_marks_day_partial(self):
        self.add(draft(kind="Plano Peri-treino",
                       meals=[meal("Pós treino", option(food("pao", None)))]), "peri")
        day = "2026-11-06"
        event = {"id": "t1", "kind": "training", "event_date": day, "session": "morning",
                 "pre_override": "auto", "post_override": "auto"}
        report = resolve(self.c, "a1", {day: {}}, events=[event])["days"][day]
        self.assertEqual(report["state"], "partial")
        self.assertEqual(report["peri_events"][0]["status"], "provisional")

    def test_draft_save_is_not_live_until_approved(self):
        from food_plan_publications_v2 import publish
        initial = draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))])
        self.add(initial, "updated")
        day = "2026-11-06"
        colors = {day: {"breakfast": {"color": "yellow"}}}
        first = resolve(self.c, "a1", colors)["days"][day]
        self.assertEqual(first["nutrition"]["kcal"], 200)
        replacement = draft(meals=[meal("Pequeno almoço", option(food("pao", 120)))])
        self.c.execute("UPDATE v2_food_plan_drafts SET content=?,updated_at=? WHERE id=?",
                       (json.dumps(replacement), 56789, "updated"))
        second = resolve(self.c, "a1", colors)["days"][day]
        self.assertEqual(second["nutrition"]["kcal"], 200)
        published = publish(self.c, "updated", expected_updated_at=56789)
        self.assertEqual(published["state"], "published")
        third = resolve(self.c, "a1", colors)["days"][day]
        self.assertEqual(third["nutrition"]["kcal"], 300)
        self.assertEqual(third["meals"]["breakfast"]["updated_at"],
                         published["published_at"])

    def test_invalid_day_does_not_fallback_to_historical_totals(self):
        day = "2026-11-06"
        report = resolve(self.c, "a1", {day: {"breakfast": {"color": "green"}}})["days"][day]
        self.assertEqual(report["state"], "partial")
        self.assertEqual(report["meals"]["breakfast"]["status"], "missing_plan")
        self.assertEqual(report["nutrition"]["kcal"], 0)

    def test_publish_requires_saved_current_revision(self):
        from food_plan_publications_v2 import publish
        self.add(draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))]))
        with self.assertRaisesRegex(ValueError, "stale_draft"):
            publish(self.c, "d1", expected_updated_at=12344)
        report=resolve(self.c, "a1", {"2026-11-06":{"breakfast":{"color":"yellow"}}})
        self.assertEqual(report["days"]["2026-11-06"]["nutrition"]["kcal"], 200)

    def test_publish_rejects_missing_food_quantity(self):
        from food_plan_publications_v2 import publish
        self.add(draft(meals=[meal("Pequeno almoço", option(food("pao", None)))]))
        with self.assertRaisesRegex(ValueError, "missing_quantity"):
            publish(self.c, "d1", expected_updated_at=12345)

    def test_published_state_flags_saved_unapproved_changes(self):
        from food_plan_publications_v2 import state_for_draft
        old = draft(meals=[meal("Pequeno almoço", option(food("pao", 80)))])
        self.add(old)
        self.assertEqual(state_for_draft(self.c, "d1", json.dumps(old))["state"], "transitional")
        new = draft(meals=[meal("Pequeno almoço", option(food("pao", 100)))])
        self.assertTrue(state_for_draft(self.c, "d1", json.dumps(new))["pending_changes"])

    def test_initial_cutover_never_auto_publishes_later_drafts(self):
        from food_plan_publications_v2 import initialize, published_for_athlete
        conn=sqlite3.connect(":memory:")
        conn.row_factory=sqlite3.Row
        try:
            conn.executescript("""
                CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, archived_at TEXT);
                CREATE TABLE v2_player_links (athlete_id TEXT, user_id TEXT);
                CREATE TABLE v2_food_plan_drafts (id TEXT PRIMARY KEY,content TEXT,
                       created_at INTEGER,updated_at INTEGER);
                INSERT INTO v2_athletes VALUES ('a1',NULL);
                INSERT INTO v2_player_links VALUES ('a1','u1');
            """)
            item=draft(meals=[meal("Pequeno almoço",option(food("pao",80)))])
            conn.execute("INSERT INTO v2_food_plan_drafts VALUES (?,?,?,?)",
                         ("existing",json.dumps(item),1,2))
            report=initialize(conn)
            self.assertEqual(report["seeded"],1)
            self.assertEqual(len(published_for_athlete(conn,"a1")["Plano amarelo"]),1)
            fresh=draft(kind="Plano verde",meals=[meal("Almoço",option(food("pao",100)))])
            conn.execute("INSERT INTO v2_food_plan_drafts VALUES (?,?,?,?)",
                         ("new",json.dumps(fresh),3,4))
            second=initialize(conn)
            self.assertEqual(second["seeded"],0)
            self.assertNotIn("Plano verde",published_for_athlete(conn,"a1"))
        finally:
            conn.close()

    def tearDown(self):
        self.c.close()


if __name__ == "__main__":
    unittest.main()
