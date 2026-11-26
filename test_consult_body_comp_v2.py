"""Composição corporal: equações iguais à folha «Registo de avaliações»; Lee como no estudo."""
import unittest

import consult_body_comp_v2 as bc

MALE = {"subscapular": 11.3, "triceps": 6.2, "biceps": 3.5, "suprailiac": 15.6, "supraspinal": 8.5,
        "abdominal": 15.2, "thigh": 6.6, "calf": 4.5, "arm_relaxed": 32.8, "thigh_mid": 62.4,
        "calf_girth": 41.2, "height_cm": 175}
FEMALE = {"weight_kg": 57, "subscapular": 14, "triceps": 19, "biceps": 7.5, "suprailiac": 18,
          "supraspinal": 10.5, "abdominal": 14, "thigh": 26, "calf": 16, "height_cm": 161,
          "arm_relaxed": 26.7, "thigh_mid": 49.6, "calf_girth": 34.1}


class BodyCompTests(unittest.TestCase):
    def test_male_equations_match_spreadsheet(self):
        eq = bc.fat_equations(dict(MALE, _ethnic=0), "M", 18, 1.75, None)
        expected = {"media4": 0.106475463, "peterson": 0.170764089, "withers": 0.09832045184,
                    "evans": 0.0955824, "faulkner": 0.131729, "reilly": 0.10027,
                    "jackson_pollock": 0.08907418, "slaughter": 0.088645, "brook": 0.2305495429,
                    "durnin": 0.1547845834}
        for key, value in expected.items():
            self.assertAlmostEqual(eq[key], value, places=6, msg=key)

    def test_female_equations_match_spreadsheet(self):
        eq = bc.fat_equations(dict(FEMALE, _ethnic=0), "F", 22, 1.61, 57 / 1.61 / 1.61)
        expected = {"brook": 0.301431228, "peterson": 0.314005836, "jackson_pollock": 0.2274034,
                    "slaughter": 0.2645, "evans": 0.2354522, "durnin": 0.2860687027}
        for key, value in expected.items():
            self.assertAlmostEqual(eq[key], value, places=6, msg=key)
        self.assertNotIn("media4", eq)  # só homens

    def test_lee_uses_age_as_in_the_study(self):
        r = bc.compute(MALE, "M", 18)
        # A folha dava 40,33 (usava a altura onde o estudo usa a idade).
        self.assertAlmostEqual(r["muscle_kg"], 39.6, places=1)
        african = bc.compute(MALE, "M", 18, "african")
        self.assertAlmostEqual(african["muscle_kg"] - r["muscle_kg"], 1.1, places=1)
        asian = bc.compute(MALE, "M", 18, "asian")
        self.assertAlmostEqual(asian["muscle_kg"] - r["muscle_kg"], -2.0, places=1)
        # Evans só ajusta para afrodescendentes; asiática não mexe na gordura.
        self.assertEqual(asian["fat_pct"], r["fat_pct"])
        self.assertEqual(r["equation"], "peterson")
        self.assertEqual(r["fat_pct"], 17.1)

    def test_missing_profile_data_and_validation(self):
        r = bc.compute({"weight_kg": 70}, "", None)
        self.assertEqual(set(r["missing"]), {"sex", "birth_date", "height_cm"})
        self.assertIsNone(r["fat_pct"])
        for bad in ({"weight_kg": 5}, {"triceps": "x"}, {"nope": 3}, {"calf": True}):
            with self.assertRaises(ValueError):
                bc.clean_measures(bad)
        self.assertEqual(bc.clean_measures({"triceps": 12.345, "weight_kg": None}), {"triceps": 12.35})
        self.assertEqual(bc.age_on("1992-05-10", "2026-05-09"), 33)
        self.assertEqual(bc.age_on("1992-05-10", "2026-05-10"), 34)


if __name__ == "__main__":
    unittest.main()
