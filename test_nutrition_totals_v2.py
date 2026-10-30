"""Regression checks for absolute prescription totals, independent of live data."""
import unittest
import nutrition_preview_v2 as nutrition

DAY="2026-10-30"
KEYS=nutrition.KEYS

def opt(kcal,protein,carbs,fat):
    return {"totals":{"kcal":kcal,"protein_g":protein,"carbs_g":carbs,"fat_g":fat}}

class NutritionParityTests(unittest.TestCase):
    def test_daily_weekly_same_day(self):
        plans={"blue":{"breakfast":[opt(500,30,70,10),opt(600,40,80,12)]},
               "green":{"lunch":[opt(800,45,100,20)]}}
        colors={"breakfast":"blue","lunch":"green"}
        peri=[{"event_date":DAY,"options":[opt(250,15,35,5)]}]
        actual=nutrition.totals(colors,plans,peri,DAY,["breakfast","lunch"])
        self.assertTrue(actual["complete"])
        # Average breakfast options: 550 kcal, 35 P, 75 HC, 11 G.
        # Lunch: 800 kcal, 45 P, 100 HC, 20 G.
        # Peri: 250 kcal, 15 P, 35 HC, 5 G.
        expected={"kcal":1600,"protein_g":95,"carbs_g":210,"fat_g":36}
        self.assertEqual(actual["totals"],expected)

    def test_removed_meal(self):
        plans={"blue":{"breakfast":[opt(500,30,70,10)]}}
        r=nutrition.totals({"breakfast":"blue","supper":"none"},plans,[],DAY,["breakfast","supper"])
        self.assertEqual(r["totals"]["kcal"],500)
        self.assertTrue(r["complete"])

    def test_peri_only(self):
        peri=[{"event_date":DAY,"options":[opt(180,10,22,4)]}]
        r=nutrition.totals({}, {},peri,DAY,["breakfast"])
        self.assertTrue(r["complete"])
        self.assertEqual(r["totals"]["kcal"],180)

    def test_missing_or_empty_macros_incomplete(self):
        for value in (None,""):
            o=opt(500,30,70,10)
            o["totals"]["protein_g"]=value
            r=nutrition.totals({"breakfast":"blue"},{"blue":{"breakfast":[o]}},[],DAY,["breakfast"])
            self.assertFalse(r["complete"])
            self.assertIsNone(r["totals"])

    def test_negative_values_invalid(self):
        r=nutrition.totals({"breakfast":"blue"},
            {"blue":{"breakfast":[opt(500,-1,70,10)]}},[],DAY,["breakfast"])
        self.assertFalse(r["complete"])

    def test_peri_other_day_not_counted(self):
        r=nutrition.totals({"breakfast":"blue"},
            {"blue":{"breakfast":[opt(500,30,70,10)]}},
            [{"event_date":"2026-10-31","options":[opt(200,10,20,3)]}],DAY,["breakfast"])
        self.assertEqual(r["totals"]["kcal"],500)

if __name__=="__main__":
    unittest.main()
