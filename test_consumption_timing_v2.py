"""Independent timing recording: no duplicate calories and no silent legacy migration."""
import sqlite3
import unittest

import consumption_nutrition_v2 as nutrition
import consumption_records_v2 as records
import consumption_timing_v2 as timings


class IntraMatchTimingTests(unittest.TestCase):
    def setUp(self):
        self.c=sqlite3.connect(":memory:")
        self.c.row_factory=sqlite3.Row
        records.initialize(self.c)
        timings.initialize(self.c)
        self.library={"drink":{"id":"drink","active":1,"kcal":60.,
                                 "protein_g":0.,"carbs_g":15.,"fat_g":0.},
                      "bar":{"id":"bar","active":1,"kcal":400.,
                               "protein_g":20.,"carbs_g":60.,"fat_g":8.}}
        self.option={"option_ref":"published-option-1","foods":[
            {"id":"drink","grams":500,"timing_splits":[
                {"timing":"pre_warmup","share":0.333333333333},
                {"timing":"post_warmup","share":0.333333333333},
                {"timing":"half_time","share":0.333333333334}]},
            {"id":"bar","grams":60,"timing":"half_time"},
        ]}

    def tearDown(self):
        self.c.close()

    def save(self,timing,status="all",option=None):
        selected=timings.timing_option(option or self.option,timing)
        result=nutrition.calculate(selected,self.library,status)
        timings.save_timing(self.c,athlete_id="athlete-a",meal_date="2026-11-20",
            event_id="match-a",timing=timing,status=status,
            option_ref=selected["option_ref"],source_draft_id="draft-a",
            prescription={"option":selected},consumed_foods=result["foods"],
            nutrition=result["nutrition"])
        return result

    def read(self,athlete="athlete-a"):
        return records.read_range(self.c,athlete,"2026-11-20","2026-11-20")

    def test_split_food_only_counts_selected_timing_fraction(self):
        one=self.save("pre_warmup")
        self.assertAlmostEqual(one["nutrition"]["kcal"],100.)
        self.assertEqual(len(self.read()),1)
        self.assertAlmostEqual(self.read()[0]["nutrition"]["kcal"],100.)
        self.assertEqual(len(self.read()[0]["timing_records"]),1)
        self.save("post_warmup")
        self.assertAlmostEqual(self.read()[0]["nutrition"]["kcal"],200.)
        self.save("half_time")
        # 500 g drink x 60/100 + 60 g bar x 400/100 = 540 kcal in all.
        self.assertAlmostEqual(self.read()[0]["nutrition"]["kcal"],540.)
        self.assertEqual(len(self.read()[0]["timing_records"]),3)
        self.assertEqual(len(self.read()),1)

    def test_reediting_replaces_only_selected_timing(self):
        for name in ("pre_warmup","post_warmup","half_time"):
            self.save(name)
        new=self.save("pre_warmup",status="none")
        self.assertEqual(new["nutrition"]["kcal"],0.)
        self.assertAlmostEqual(self.read()[0]["nutrition"]["kcal"],440.)
        self.assertEqual(len(self.read()[0]["timing_records"]),3)

    def test_undo_one_timing_keeps_other_timings(self):
        self.save("pre_warmup")
        self.save("half_time")
        self.assertTrue(timings.delete_timing(self.c,athlete_id="athlete-a",
            meal_date="2026-11-20",event_id="match-a",timing="pre_warmup"))
        self.assertAlmostEqual(self.read()[0]["nutrition"]["kcal"],340.)
        self.assertEqual(self.read()[0]["timing_records"][0]["timing"],"half_time")
        self.assertEqual(self.read("athlete-b"),[])

    def test_legacy_row_is_untouched_and_rejects_timing_save(self):
        calculated=nutrition.calculate(self.option,self.library,"all")
        records.save_record(self.c,athlete_id="athlete-a",meal_date="2026-11-20",
            meal_key="intra_match",event_id="match-a",status="all",
            option_ref="published-option-1",source_draft_id="draft-a",
            prescription={"option":self.option},consumed_foods=calculated["foods"],
            nutrition=calculated["nutrition"])
        with self.assertRaisesRegex(ValueError,"legacy_consumption_exists"):
            self.save("pre_warmup")
        previous=self.read()[0]
        self.assertNotIn("timing_records",previous)
        self.assertEqual(previous["status"],"all")
        self.assertAlmostEqual(previous["nutrition"]["kcal"],540.)

    def test_timing_validation_and_no_unpublished_timing(self):
        with self.assertRaisesRegex(ValueError,"invalid_timing"):
            timings.timing_option(self.option,"untrusted")
        self.assertIsNone(timings.timing_option(self.option,"first_half"))
        bad={"option_ref":"x","foods":[{"id":"drink","grams":500,
            "timing_splits":[{"timing":"pre_warmup","share":0.7}]}]}
        with self.assertRaisesRegex(ValueError,"invalid_timing_split"):
            timings.timing_option(bad,"pre_warmup")

    def test_multiple_events_and_athletes_do_not_collide(self):
        self.save("pre_warmup")
        selected=timings.timing_option(self.option,"pre_warmup")
        result=nutrition.calculate(selected,self.library,"all")
        timings.save_timing(self.c,athlete_id="athlete-a",meal_date="2026-11-20",
            event_id="match-b",timing="pre_warmup",status="all",
            option_ref="published-option-1",source_draft_id="draft-a",
            prescription={"option":selected},consumed_foods=result["foods"],nutrition=result["nutrition"])
        self.assertEqual(len(self.read()),2)
        self.assertEqual(self.read("athlete-b"),[])


if __name__=="__main__":
    unittest.main()
