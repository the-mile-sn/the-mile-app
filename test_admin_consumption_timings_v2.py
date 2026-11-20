"""Read-only admin compatibility with independent player intra-match timing records."""
import json
import sqlite3
import unittest
from pathlib import Path

import consumption_records_v2 as records

ROOT=Path(__file__).resolve().parent


class AdminConsumptionTimingTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        records.initialize(self.c)

    def tearDown(self):
        self.c.close()

    def timing_table(self):
        self.c.execute("""
            CREATE TABLE v2_consumption_timing_records (
                athlete_id TEXT NOT NULL, meal_date TEXT NOT NULL,
                meal_key TEXT NOT NULL, event_id TEXT NOT NULL,
                timing TEXT NOT NULL, status TEXT NOT NULL,
                option_ref TEXT NOT NULL, source_draft_id TEXT,
                prescription_json TEXT NOT NULL, consumed_foods_json TEXT NOT NULL,
                nutrition_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
                PRIMARY KEY(athlete_id,meal_date,meal_key,event_id,timing)
            )
        """)

    def add(self, timing, kcal, athlete="a", date="2026-11-20", event="match-1"):
        self.c.execute("""
            INSERT INTO v2_consumption_timing_records
            (athlete_id,meal_date,meal_key,event_id,timing,status,option_ref,
             source_draft_id,prescription_json,consumed_foods_json,nutrition_json,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,(athlete,date,"intra_match",event,timing,"all","plan-option","draft-1",
            json.dumps({"option":{"title":"Opção 1","foods":[{"id":"gel","grams":kcal}]}}),
            json.dumps([{"id":"gel","grams":kcal,"option_index":0}]),
            json.dumps({"kcal":kcal,"protein_g":0.0,"carbs_g":kcal/4,"fat_g":0.0}),12345))
        self.c.commit()

    def read(self, athlete="a", date="2026-11-20"):
        return records.read_range(self.c,athlete,date,date)

    def test_old_database_without_timing_table_still_reads(self):
        self.assertEqual(self.read(),[])
        records.save_record(self.c,athlete_id="a",meal_date="2026-11-20",meal_key="lunch",
            status="all",option_ref="base",source_draft_id="draft",event_id="",
            prescription={"option":{"foods":[]}},consumed_foods=[],
            nutrition={"kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0})
        self.assertEqual(self.read()[0]["meal_key"],"lunch")

    def test_two_timings_aggregate_once_and_retain_detail(self):
        self.timing_table()
        self.add("warmup",100)
        self.add("half_time",240)
        rows=self.read()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["meal_key"],"intra_match")
        self.assertEqual(rows[0]["nutrition"]["kcal"],340)
        self.assertEqual(rows[0]["nutrition"]["carbs_g"],85)
        self.assertEqual(len(rows[0]["timing_records"]),2)
        self.assertEqual([t["timing"] for t in rows[0]["timing_records"]],["half_time","warmup"])
        self.assertEqual(len(rows[0]["consumed_foods"]),2)
        self.assertEqual(rows[0]["timing_records"][0]["prescription"]["option"]["title"],"Opção 1")

    def test_legacy_record_takes_precedence_to_prevent_double_count(self):
        self.timing_table()
        self.add("warmup",100)
        records.save_record(self.c,athlete_id="a",meal_date="2026-11-20",
            meal_key="intra_match",event_id="match-1",status="all",option_ref="x",
            source_draft_id="draft",prescription={"option":{"foods":[]}},
            consumed_foods=[],nutrition={"kcal":390,"protein_g":0,"carbs_g":98,"fat_g":0})
        rows=self.read()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["nutrition"]["kcal"],390)
        self.assertNotIn("timing_records",rows[0])

    def test_isolated_by_athlete_date_and_event(self):
        self.timing_table()
        self.add("warmup",100)
        self.add("half_time",220,event="match-2")
        self.add("warmup",900,athlete="b")
        self.add("warmup",450,date="2026-11-21")
        self.assertEqual(sorted(row["nutrition"]["kcal"] for row in self.read()),[100,220])
        self.assertEqual(self.read("b")[0]["nutrition"]["kcal"],900)
        self.assertEqual(self.read("a","2026-11-21")[0]["nutrition"]["kcal"],450)

    def test_admin_labels_and_timing_view_contract(self):
        js=(ROOT/"static/admin-consumption.js").read_text(encoding="utf-8")
        css=(ROOT/"static/admin-consumption.css").read_text(encoding="utf-8")
        self.assertIn('pre_training:"Pré-treino"',js)
        self.assertIn('post_training:"Pós-treino"',js)
        self.assertIn('half_time:"Intervalo"',js)
        self.assertIn("entry.prescription?.origin==='player_added'",js)
        self.assertIn("Adicionado pelo jogador",js)
        self.assertIn("tm-record-origin",css)
        self.assertIn("if(Array.isArray(r.timing_records)&&r.timing_records.length)return timingCard(r);",js)
        self.assertIn("const entries=Array.isArray(r.timing_records)?r.timing_records:[r];",js)
        self.assertIn(".tm-record-timing-block{",css)


if __name__=="__main__":
    unittest.main()
