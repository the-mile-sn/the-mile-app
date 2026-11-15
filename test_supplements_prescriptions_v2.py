"""Regression tests: per-day overlapping supplement prescriptions and legacy compatibility."""
import sqlite3
import unittest

import supplements_v2


class SupplementPrescriptionTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE v2_athletes(id TEXT PRIMARY KEY)")
        self.db.execute("CREATE TABLE v2_match_events(id TEXT PRIMARY KEY, athlete_id TEXT, match_date TEXT)")
        self.db.execute("INSERT INTO v2_athletes(id) VALUES ('athlete-1')")
        self.db.execute(
            "INSERT INTO v2_match_events(id,athlete_id,match_date) VALUES ('game-1','athlete-1','2026-11-15')"
        )
        supplements_v2.initialize(self.db)
        self.matches = [{"id": "game-1", "match_date": "2026-11-15"}]

    def tearDown(self):
        self.db.close()

    @staticmethod
    def creatine(mode="replace"):
        second = {
            "rule": "match", "dose": "10 g", "moment": "lunch",
            "timing_text": "Dia de jogo", "note": "Com almoço",
        }
        if mode is not None:
            second["overlap_mode"] = mode
        return {
            "library_id": "creatine-1", "name": "Creatina", "dose": "5 g",
            "moment": "lunch", "rule": "daily", "note": "Com água",
            "timing_text": "Com almoço",
            "prescriptions": [
                {"rule": "daily", "dose": "5 g", "moment": "lunch",
                 "timing_text": "Com almoço", "note": "Com água"},
                second,
            ],
        }

    def publish(self, item, exclusions=None, overrides=None):
        return supplements_v2.save(
            self.db, "athlete-1", {
                "plan": [item], "overrides": overrides or {},
                "match_exclusions": exclusions or {},
            }
        )

    def week(self, events=None):
        return supplements_v2.days(
            self.db, "athlete-1", "2026-11-14", "2026-11-16",
            self.matches, events or [],
        )

    def test_replace_specific_prescription_only_on_its_applicable_day(self):
        saved = self.publish(self.creatine("replace"))
        self.assertEqual(saved["plan"][0]["prescriptions"][1]["overlap_mode"], "replace")
        week = self.week()
        self.assertEqual([x["dose"] for x in week["2026-11-14"]], ["5 g"])
        self.assertEqual([x["dose"] for x in week["2026-11-15"]], ["10 g"])
        self.assertEqual([x["dose"] for x in week["2026-11-16"]], ["5 g"])
        md = week["2026-11-15"][0]
        self.assertEqual(md["prescription_index"], 1)
        self.assertEqual(md["prescription_total"], 2)
        self.assertEqual(md["supplement_index"], 0)
        self.assertEqual(md["moment"], "lunch")
        self.assertEqual(md["note"], "Com almoço")

    def test_additive_choice_displays_both_prescriptions_on_match_day(self):
        self.publish(self.creatine("add"))
        md = self.week()["2026-11-15"]
        self.assertEqual([x["dose"] for x in md], ["5 g", "10 g"])
        self.assertEqual([x["prescription_index"] for x in md], [0, 1])
        self.assertTrue(all(x["prescription_total"] == 2 for x in md))

    def test_legacy_unclassified_overlap_is_preserved_as_additive(self):
        self.publish(self.creatine(None))
        md = self.week()["2026-11-15"]
        self.assertEqual([x["dose"] for x in md], ["5 g", "10 g"])
        self.assertNotIn("overlap_mode", md[1])

    def test_match_exclusion_suppresses_specific_rule_not_daily_base(self):
        self.publish(self.creatine("replace"), exclusions={"game-1": ["creatine-1"]})
        md = self.week()["2026-11-15"]
        self.assertEqual([x["dose"] for x in md], ["5 g"])

    def test_invalid_overlap_choice_is_rejected(self):
        item = self.creatine("maybe")
        with self.assertRaisesRegex(ValueError, "invalid_overlap_mode"):
            self.publish(item)

    def test_same_dose_prescriptions_remain_separate(self):
        item = self.creatine("add")
        item["prescriptions"][1]["dose"] = "5 g"
        item["prescriptions"][1]["moment"] = "dinner"
        self.publish(item)
        md = self.week()["2026-11-15"]
        self.assertEqual([x["dose"] for x in md], ["5 g", "5 g"])
        self.assertEqual([x["moment"] for x in md], ["lunch", "dinner"])
        self.assertEqual([x["prescription_index"] for x in md], [0, 1])

    def test_explicit_day_override_remains_compatible(self):
        override = {"2026-11-16": {
            "add": [{"name": "Eletrólitos", "dose": "1 dose",
                     "moment": "lunch", "rule": "daily"}],
            "remove": [],
        }}
        self.publish(self.creatine("replace"), overrides=override)
        self.assertEqual([x["name"] for x in self.week()["2026-11-16"]],
                         ["Creatina", "Eletrólitos"])

    def test_training_prescription_replaces_daily_only_when_training(self):
        item = self.creatine("replace")
        item["prescriptions"][1]["rule"] = "training"
        self.publish(item)
        week = self.week(events=[{"event_date": "2026-11-15", "kind": "training"}])
        self.assertEqual([x["dose"] for x in week["2026-11-14"]], ["5 g"])
        self.assertEqual([x["dose"] for x in week["2026-11-15"]], ["10 g"])
        self.assertEqual([x["dose"] for x in week["2026-11-16"]], ["5 g"])


if __name__ == "__main__":
    unittest.main()
