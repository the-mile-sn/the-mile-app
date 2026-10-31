import ast
import pathlib
import sqlite3
import unittest
from unittest.mock import patch
import microcycles_v2

ROOT=pathlib.Path(__file__).resolve().parent

class PlayerAccountCreationTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, username TEXT UNIQUE, sex TEXT, role TEXT)")
        microcycles_v2.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def create_linked(self, name="Teste",username="jogador",sex="F",fail=False):
        try:
            athlete=microcycles_v2.create_athlete(self.db,name,commit=False,weight_kg=75.5)
            self.db.execute("INSERT INTO users(id,name,username,sex,role) VALUES(?,?,?,?,?)",("user-"+username,name,username,sex,"player"))
            if fail:
                raise RuntimeError("simulated failure before link")
            self.db.execute("INSERT INTO v2_player_links(user_id,athlete_id,linked_at) VALUES(?,?,?)",("user-"+username,athlete["id"],1))
            self.db.commit()
            return athlete
        except Exception:
            self.db.rollback()
            raise

    def test_atomic_creation_produces_one_linked_account(self):
        athlete=self.create_linked()
        row=microcycles_v2.get_model(self.db,athlete["id"])["athlete"]
        self.assertEqual(row["sex"],"F")
        self.assertEqual(row["weight_kg"],75.5)
        self.assertEqual(self.db.execute("SELECT count(*) FROM v2_player_links").fetchone()[0],1)

    def test_failure_rolls_back_athlete_and_account(self):
        with self.assertRaises(RuntimeError):
            self.create_linked(fail=True)
        for table in ("v2_athletes","v2_player_links","users","v2_microcycle_rows"):
            self.assertEqual(self.db.execute("SELECT count(*) FROM "+table).fetchone()[0],0,table)

    def test_duplicate_username_does_not_leave_orphan(self):
        self.create_linked()
        with self.assertRaises(sqlite3.IntegrityError):
            self.create_linked("Outro","jogador","M")
        self.assertEqual(self.db.execute("SELECT count(*) FROM v2_athletes").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM users").fetchone()[0],1)

    def test_profile_sex_updates_users_not_athlete(self):
        athlete=self.create_linked()
        microcycles_v2.update_athlete_profile(self.db,athlete["id"],"Teste",75,180,"",sex="M")
        self.assertEqual(self.db.execute("SELECT sex FROM users").fetchone()[0],"M")
        self.assertIsNone(self.db.execute("SELECT sex FROM v2_athletes").fetchone()[0])

    def test_profile_name_stays_in_sync_with_linked_login(self):
        athlete=self.create_linked()
        microcycles_v2.update_athlete_profile(self.db,athlete["id"],"Nome Atualizado",76,180,"Nota",sex="F")
        athlete_row=self.db.execute("SELECT name,weight_kg FROM v2_athletes WHERE id=?",(athlete["id"],)).fetchone()
        user_row=self.db.execute("SELECT name,sex,username FROM users WHERE id=?",("user-jogador",)).fetchone()
        self.assertEqual(athlete_row["name"],"Nome Atualizado")
        self.assertEqual(athlete_row["weight_kg"],76)
        self.assertEqual(user_row["name"],"Nome Atualizado")
        self.assertEqual(user_row["sex"],"F")
        self.assertEqual(user_row["username"],"jogador")

    def test_missing_profile_name_is_rejected(self):
        with self.assertRaises(ValueError):
            self.create_linked(name="x")
        self.assertEqual(self.db.execute("SELECT count(*) FROM users").fetchone()[0],0)

    def test_weight_required_and_invalid_weight_creates_no_profile(self):
        for value in (None,"",0,19,251,"not a number",float("nan"),float("inf")):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    microcycles_v2.create_athlete(self.db,"Jogador",commit=False,weight_kg=value)
                self.assertEqual(self.db.execute("SELECT count(*) FROM v2_athletes").fetchone()[0],0)

    def test_profile_auxiliary_measurements_and_position_roundtrip(self):
        athlete=self.create_linked()
        updated=microcycles_v2.update_athlete_profile(
            self.db,athlete["id"],"Teste",75.5,180,"",sex="F",
            field_position="gr",arm_point=13.5,thigh_point=24.2)
        self.assertEqual(updated["field_position"],"GR")
        data=microcycles_v2.get_model(self.db,athlete["id"])["athlete"]
        self.assertEqual(data["field_position"],"GR")
        self.assertEqual(data["arm_point"],13.5)
        self.assertEqual(data["thigh_point"],24.2)

    def test_invalid_auxiliary_points_do_not_modify_player(self):
        athlete=self.create_linked()
        for arm,thigh in ((-1,22),(15,151),("not numeric",20)):
            with self.subTest(arm=arm,thigh=thigh):
                with self.assertRaises(ValueError):
                    microcycles_v2.update_athlete_profile(
                        self.db,athlete["id"],"Teste",75.5,180,"",sex="F",
                        field_position="GR",arm_point=arm,thigh_point=thigh)
        self.assertIsNone(self.db.execute(
            "SELECT field_position FROM v2_athletes WHERE id=?",(athlete["id"],)).fetchone()[0])

    def test_profile_api_preserves_auxiliary_fields_when_omitted(self):
        source=(ROOT/"app.py").read_text()
        self.assertIn("body.get('field_position', current_profile['field_position'])",source)
        self.assertIn("body.get('arm_point', current_profile['arm_point'])",source)
        self.assertIn("body.get('thigh_point', current_profile['thigh_point'])",source)

    def test_endpoint_source_requires_atomic_credentials(self):
        source=(ROOT/"app.py").read_text()
        start=source.index("if path == '/api/v2/athletes':")
        end=source.index("if path.startswith('/api/v2/athletes/'):",start)
        segment=source[start:end]
        for check in ("username","password","sex","commit=False","v2_player_links","c.commit()","c.rollback()"):
            self.assertIn(check,segment)

if __name__=="__main__":
    unittest.main()
