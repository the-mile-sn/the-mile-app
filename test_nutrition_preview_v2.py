import unittest
import nutrition_preview_v2 as preview


class NutritionPreviewTests(unittest.TestCase):
    def test_average_multiple_options_and_peri(self):
        plans={"green":{"breakfast":[{"totals":{"kcal":200,"protein_g":10,"carbs_g":30,"fat_g":5}},{"totals":{"kcal":300,"protein_g":20,"carbs_g":40,"fat_g":10}}]}}
        peri=[{"event_date":"2026-11-09","event_id":"training","phase":"post","options":[{"totals":{"kcal":100,"protein_g":5,"carbs_g":10,"fat_g":2}}]}]
        result=preview.totals({"breakfast":"green"},plans,peri,"2026-11-09",["breakfast"])
        self.assertTrue(result["complete"])
        self.assertEqual(result["totals"],{"kcal":350,"protein_g":20,"carbs_g":45,"fat_g":9.5})

    def test_missing_publication_never_creates_false_total(self):
        result=preview.totals({"breakfast":"blue"},{},[],"2026-11-09",["breakfast"])
        self.assertFalse(result["complete"])
        self.assertIsNone(result["totals"])
        self.assertEqual(result["missing"],["breakfast"])

    def test_manual_none_excludes_meal(self):
        result=preview.totals({"breakfast":None},{},[{"event_date":"2026-11-09","event_id":"m","phase":"pre","options":[{"totals":{"kcal":50,"protein_g":0,"carbs_g":12,"fat_g":0}}]}],"2026-11-09",["breakfast"])
        self.assertTrue(result["complete"])
        self.assertEqual(result["totals"]["kcal"],50)


if __name__=="__main__":
    unittest.main()
