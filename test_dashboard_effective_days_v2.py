"""Weekly dashboard shares effective classifications and nutrition precedence."""
import sqlite3
import unittest

import calendar_v2
import dashboard_v2



class DashboardSelectedDayTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(":memory:")
        self.c.row_factory = sqlite3.Row
        self.c.executescript("""
          CREATE TABLE v2_athletes(id TEXT PRIMARY KEY,name TEXT,archived_at BIGINT);
          CREATE TABLE v2_match_events(id TEXT,athlete_id TEXT,match_date TEXT,match_time TEXT);
          CREATE TABLE v2_calendar_events(
            id TEXT,athlete_id TEXT,event_date TEXT,kind TEXT,title TEXT,session TEXT);
          CREATE TABLE v2_player_links(athlete_id TEXT,user_id TEXT);
          CREATE TABLE users(id TEXT,role TEXT,active INTEGER,birth_date TEXT);
          INSERT INTO v2_athletes VALUES('p1','Atleta Ativo',NULL);
          INSERT INTO v2_athletes VALUES('p2','Atleta Arquivado',123);
          INSERT INTO v2_match_events VALUES('m1','p1','2026-11-21','19:25');
          INSERT INTO v2_match_events VALUES('m2','p2','2026-11-21','18:00');
          INSERT INTO v2_match_events VALUES('m3','p1','2026-11-20','16:00');
          INSERT INTO v2_calendar_events VALUES('e1','p1','2026-11-21','travel','Viagem','morning');
          INSERT INTO v2_calendar_events VALUES('e2','p1','2026-11-21','other','Reunião','afternoon');
          INSERT INTO v2_calendar_events VALUES('e3','p1','2026-11-21','training','Treino','morning');
          INSERT INTO v2_calendar_events VALUES('e4','p2','2026-11-21','travel','Viagem','morning');
          INSERT INTO users VALUES('u1','player',1,'2000-11-21');
          INSERT INTO users VALUES('u2','player',1,'2000-11-21');
          INSERT INTO v2_player_links VALUES('p1','u1');
          INSERT INTO v2_player_links VALUES('p2','u2');
        """)

    def tearDown(self):
        self.c.close()

    def test_selected_day_includes_only_active_relevant_activities(self):
        data=dashboard_v2.day_activity(self.c,"2026-11-21")
        self.assertEqual(data["date"],"2026-11-21")
        self.assertEqual([g["match_id"] for g in data["games"]],["m1"])
        self.assertEqual([e["kind"] for e in data["events"]],["travel","other"])
        self.assertEqual([b["name"] for b in data["birthdays"]],["Atleta Ativo"])
        self.assertTrue(data["read_only"])
        other=dashboard_v2.day_activity(self.c,"2026-11-20")
        self.assertEqual([g["match_id"] for g in other["games"]],["m3"])
        self.assertFalse(other["events"])
        self.assertFalse(other["birthdays"])

    def test_selected_day_rejects_invalid_dates(self):
        for day in ("2026-02-30","20/11/2026","",None):
            with self.assertRaises(ValueError):
                dashboard_v2.day_activity(self.c,day)



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
        self.assertTrue(day["needs_confirmation"])
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
        self.assertFalse(rows[0]["needs_confirmation"])
        self.assertFalse(rows[1]["needs_confirmation"])
        self.assertFalse(rows[4]["needs_confirmation"])

    def test_manual_day_precedence_over_auto_and_manual_meal_colour(self):
        self.c.execute("""INSERT INTO v2_day_classification_overrides
                          VALUES('p1','2026-11-09','Geral','admin',1)""")
        matches=[{"id":"game1","match_date":"2026-11-08"}]
        day=self.week(matches,{("2026-11-09","lunch"):"blue"})[0]
        self.assertEqual(day["classification"],"Geral")
        self.assertEqual(day["classification_source"],"manual")
        self.assertFalse(day["needs_confirmation"])
        self.assertEqual(day["colors"]["breakfast"],"yellow")
        self.assertEqual(day["colors"]["lunch"],"blue")

    def test_manual_meal_colour_does_not_confirm_automatic_general(self):
        day=self.week(manual={("2026-11-09","lunch"):"blue"})[0]
        self.assertEqual(day["classification"],"Geral")
        self.assertTrue(day["needs_confirmation"])
        self.assertEqual(day["colors"]["lunch"],"blue")

    def test_confirming_general_and_resetting_to_auto(self):
        self.c.execute("""INSERT INTO v2_day_classification_overrides
                          VALUES('p1','2026-11-09','Geral','admin',1)""")
        self.assertFalse(self.week()[0]["needs_confirmation"])
        self.c.execute("DELETE FROM v2_day_classification_overrides WHERE athlete_id='p1'")
        self.assertTrue(self.week()[0]["needs_confirmation"])

    def test_valid_md_is_never_pending(self):
        matches=[{"id":"game1","match_date":"2026-11-15"}]
        day=self.week(matches)[0]
        self.assertEqual(day["classification"],"MD-6")
        self.assertFalse(day["needs_confirmation"])

    def test_manual_off_without_event_uses_off_palette(self):
        self.c.execute("""INSERT INTO v2_day_classification_overrides
                          VALUES('p1','2026-11-09','Off','admin',1)""")
        day=self.week()[0]
        self.assertTrue(day["is_off"])
        self.assertEqual(day["classification"],"Off")
        self.assertEqual(day["colors"]["breakfast"],"blue")
        self.assertFalse(day["needs_confirmation"])


if __name__=="__main__":
    unittest.main()
