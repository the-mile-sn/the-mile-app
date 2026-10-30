"""Regression tests for the historical clinical reference-weight selection."""
import json
import sqlite3
import unittest
import monitoring_v2


class ReferenceWeightTests(unittest.TestCase):
    def setUp(self):
        self.athlete="athlete"
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        self.db.execute("CREATE TABLE v2_athletes (id TEXT PRIMARY KEY, weight_kg REAL)")
        self.db.execute("INSERT INTO v2_athletes VALUES (?,?)",(self.athlete,85))
        self.db.execute("CREATE TABLE v2_daily_weighins (athlete_id TEXT, weigh_date TEXT, weight_kg REAL)")
        self.db.execute("CREATE TABLE v2_body_assessments (athlete_id TEXT, assessed_on TEXT, measurements TEXT, status TEXT)")
        self.day="2026-10-30"

    def tearDown(self):
        self.db.close()

    def weigh(self, day, value):
        self.db.execute("INSERT INTO v2_daily_weighins VALUES (?,?,?)", (self.athlete,day,value))

    def assess(self, day, value, status="draft"):
        self.db.execute("INSERT INTO v2_body_assessments VALUES (?,?,?,?)",
                        (self.athlete,day,json.dumps({"weight":value}),status))

    def result(self):
        return monitoring_v2.reference_weight(self.db,self.athlete,self.day)

    def test_three_recent_weighins_are_averaged(self):
        self.weigh("2026-10-24",81)
        self.weigh("2026-10-27",82)
        self.weigh("2026-10-30",83)
        self.assess("2026-10-29",79)
        self.assertEqual(self.result()["weight_kg"],82)
        self.assertEqual(self.result()["source"],"7_day_average")

    def test_two_recent_weighins_use_latest(self):
        self.weigh("2026-10-25",81)
        self.weigh("2026-10-29",82)
        self.assertEqual(self.result()["weight_kg"],82)

    def test_newer_draft_assessment_beats_old_weighin(self):
        self.weigh("2026-08-15",84)
        self.assess("2026-10-15",82)
        self.assertEqual(self.result()["weight_kg"],82)
        self.assertEqual(self.result()["source"],"assessment")

    def test_newer_old_weighin_beats_assessment(self):
        self.assess("2026-08-15",84)
        self.weigh("2026-10-15",82)
        self.assertEqual(self.result()["weight_kg"],82)
        self.assertEqual(self.result()["source"],"latest_older")

    def test_no_future_measurements(self):
        self.weigh("2026-10-31",81)
        self.assess("2026-11-01",82)
        self.assertEqual(self.result()["source"],"profile_fallback")
        self.assertEqual(self.result()["weight_kg"],85)

    def test_historical_weight_is_stable_after_new_weighin(self):
        self.weigh("2026-10-10",84)
        self.assess("2026-10-20",82)
        first=monitoring_v2.reference_weight(self.db,self.athlete,"2026-10-25")
        self.weigh("2026-11-05",79)
        again=monitoring_v2.reference_weight(self.db,self.athlete,"2026-10-25")
        self.assertEqual(first,again)
        self.assertEqual(again["weight_kg"],82)

    def test_assessment_precedes_profile(self):
        self.assess("2026-10-10",82)
        self.assertEqual(self.result()["weight_kg"],82)
        self.assertEqual(self.result()["source"],"assessment")

    def test_missing_profile_and_history(self):
        self.db.execute("UPDATE v2_athletes SET weight_kg=NULL WHERE id=?",(self.athlete,))
        self.assertIsNone(self.result())

    def test_no_history(self):
        self.assertEqual(self.result()["source"],"profile_fallback")
        self.assertEqual(self.result()["weight_kg"],85)

    def test_assessment_with_invalid_weight_is_skipped(self):
        self.assess("2026-10-28",None)
        self.assess("2026-10-20",81)
        self.assertEqual(self.result()["weight_kg"],81)

    def test_recent_single_weighin_remains_preferred(self):
        self.weigh("2026-10-28",82)
        self.assess("2026-10-29",80)
        self.assertEqual(self.result()["weight_kg"],82)
        self.assertEqual(self.result()["source"],"latest_recent")


if __name__=="__main__":
    unittest.main()
