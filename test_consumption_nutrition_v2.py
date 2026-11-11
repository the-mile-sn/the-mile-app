"""Regression tests for player consumption nutrition. Run: python -m unittest test_consumption_nutrition_v2.py"""
import unittest
import consumption_nutrition_v2 as nutrition

LIB = {
    "rice": {"id":"rice","active":1,"variant":"plain","kcal":100,"protein_g":2,"carbs_g":20,"fat_g":1},
    "potato": {"id":"potato","active":1,"variant":"plain","kcal":80,"protein_g":1,"carbs_g":18,"fat_g":0},
    "egg": {"id":"egg","active":1,"variant":"plain","kcal":150,"protein_g":12,"carbs_g":1,"fat_g":10},
    "inactive": {"id":"inactive","active":0,"variant":"plain","kcal":100,"protein_g":0,"carbs_g":0,"fat_g":0},
}
OPTION = {"foods":[{"id":"rice","grams":100},{"id":"potato","grams":150,"alternative_to":0},{"id":"egg","grams":100}]}

def edits(selected, grams=None):
    grams=grams or {}
    return [{"index":i,"consumed":i in selected,"grams":grams.get(i,f["grams"])} for i,f in enumerate(OPTION["foods"])]

class ConsumptionNutritionTests(unittest.TestCase):
    def test_all_uses_mean_of_equivalents(self):
        result=nutrition.calculate(OPTION,LIB,"all")
        self.assertAlmostEqual(result["nutrition"]["kcal"],260)
        self.assertEqual(len(result["foods"]),2)

    def test_either_equivalent_same_nutrition(self):
        a=nutrition.calculate(OPTION,LIB,"partial",edits({0,2}))
        b=nutrition.calculate(OPTION,LIB,"partial",edits({1,2}))
        self.assertEqual(a["nutrition"],b["nutrition"])
        self.assertAlmostEqual(a["nutrition"]["kcal"],260)

    def test_partial_scales_selected_quantity(self):
        result=nutrition.calculate(OPTION,LIB,"partial",edits({1},{1:75}))
        self.assertAlmostEqual(result["nutrition"]["kcal"],55)

    def test_both_equivalents_rejected(self):
        with self.assertRaisesRegex(ValueError,"multiple_equivalents_selected"):
            nutrition.calculate(OPTION,LIB,"partial",edits({0,1}))

    def test_none_is_zero(self):
        self.assertEqual(nutrition.calculate(OPTION,LIB,"none")["nutrition"]["kcal"],0)

    def test_added_active_library_food(self):
        result=nutrition.calculate(OPTION,LIB,"partial",edits(set()),[{"id":"egg","grams":50}])
        self.assertAlmostEqual(result["nutrition"]["kcal"],75)
        self.assertTrue(result["foods"][0]["additional"])

    def test_unknown_food_rejected(self):
        with self.assertRaisesRegex(ValueError,"food_unavailable"):
            nutrition.calculate(OPTION,LIB,"partial",edits(set()),[{"id":"unknown","grams":50}])

    def test_inactive_food_rejected(self):
        with self.assertRaisesRegex(ValueError,"food_unavailable"):
            nutrition.calculate(OPTION,LIB,"partial",edits(set()),[{"id":"inactive","grams":50}])

    def test_duplicate_food_edits_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_food_selection"):
            nutrition.calculate(OPTION,LIB,"partial",[{"index":0,"consumed":True,"grams":100}]*3)

    def test_zero_added_quantity_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_additional_quantity"):
            nutrition.calculate(OPTION,LIB,"partial",edits(set()),[{"id":"egg","grams":0}])

if __name__=="__main__":
    unittest.main()
