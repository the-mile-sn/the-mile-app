"""Regression checks for historical perimeter sums in the player assessment API."""
import json
import sqlite3
import unittest

import assessments_v2


class HistoricalPerimeterTotalsTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.row_factory=sqlite3.Row
        assessments_v2.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def insert(self,athlete,date,measurements,status="published"):
        self.db.execute(
            "INSERT INTO v2_body_assessments (id,athlete_id,assessed_on,measurements,averages,status,created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (athlete+"-"+date,athlete,date,json.dumps(measurements),"{}",status,1)
        )
        self.db.commit()

    def test_older_published_values_are_derived_without_db_writes(self):
        self.insert("andre","2023-05-05",{"arm_muscle":29.25,"thigh_muscle":52.31,"calf_muscle":35.75})
        self.insert("andre","2024-12-19",{"arm_muscle":29,"thigh_muscle":52,"calf_muscle":36.46})
        self.insert("andre","2026-09-21",{"arm_muscle":30,"thigh_muscle":52.5,"calf_muscle":37.2,"sum_perimeters":119.7})
        records=assessments_v2.rows(self.db,"andre",public=True)
        self.assertEqual([r["measurements"]["sum_perimeters"] for r in records],[117.31,117.46,119.7])
        stored=self.db.execute("SELECT measurements FROM v2_body_assessments WHERE athlete_id='andre' ORDER BY assessed_on").fetchall()
        self.assertNotIn("sum_perimeters",json.loads(stored[0]["measurements"]))
        self.assertNotIn("sum_perimeters",json.loads(stored[1]["measurements"]))

    def test_existing_total_missing_components_and_drafts_are_respected(self):
        self.insert("athlete","2023-01-01",{"sum_perimeters":101,"arm_muscle":30,"thigh_muscle":40,"calf_muscle":41})
        self.insert("athlete","2023-02-01",{"arm_muscle":30,"thigh_muscle":42})
        self.insert("athlete","2023-03-01",{"arm_muscle":30,"thigh_muscle":42,"calf_muscle":36},status="draft")
        self.insert("other","2023-01-01",{"arm_muscle":20,"thigh_muscle":30,"calf_muscle":40})
        public=assessments_v2.rows(self.db,"athlete",public=True)
        self.assertEqual(len(public),2)
        self.assertEqual(public[0]["measurements"]["sum_perimeters"],101)
        self.assertNotIn("sum_perimeters",public[1]["measurements"])
        self.assertEqual(len(assessments_v2.rows(self.db,"athlete",public=False)),3)
        self.assertEqual(assessments_v2.rows(self.db,"other",public=True)[0]["measurements"]["sum_perimeters"],90)


if __name__=="__main__":
    unittest.main()
