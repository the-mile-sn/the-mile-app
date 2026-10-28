"""Isolated regression tests; no live API or database writes."""
import unittest
from effective_nutrition_v2 import calculate_day

def option(kcal,p,c,f):
    return {"totals":{"kcal":kcal,"protein_g":p,"carbs_g":c,"fat_g":f}}

class EffectiveNutritionTests(unittest.TestCase):
    def setUp(self):
        self.options={
            "blue":{"breakfast":[option(400,20,60,8)],"lunch":[option(700,40,90,18)]},
            "yellow":{"breakfast":[option(300,18,40,7)],"lunch":[option(550,35,65,14)]}
        }
        self.base={meal:{"color":None} for meal in ("breakfast","lunch","snack","dinner","supper")}
        self.base["breakfast"]={"color":"blue"}
        self.base["lunch"]={"color":"blue"}
    def test_base_totals(self):
        result=calculate_day(self.base,self.options)
        self.assertEqual(result["total"]["kcal"],1100)
        self.assertEqual(result["total"]["protein_g"],60)
    def test_scenario_color_recalculates_all_macros(self):
        changed={**self.base,"breakfast":{"color":"yellow"}}
        result=calculate_day(changed,self.options)
        self.assertEqual(result["total"],{"kcal":1000.0,"protein_g":58.0,"carbs_g":130.0,"fat_g":25.0})
    def test_manual_color_matches_effective_color(self):
        changed={**self.base,"lunch":{"color":"yellow","source":"manual"}}
        self.assertEqual(calculate_day(changed,self.options)["total"]["kcal"],950)
    def test_no_meal_is_excluded(self):
        changed={**self.base,"lunch":{"color":None}}
        self.assertEqual(calculate_day(changed,self.options)["total"]["kcal"],400)
    def test_missing_options_is_partial(self):
        changed={**self.base,"breakfast":{"color":"orange"}}
        result=calculate_day(changed,self.options)
        self.assertEqual(result["state"],"partial")
        self.assertIn(("breakfast","orange"),result["missing"])
    def test_peri_adds_nutrition(self):
        result=calculate_day(self.base,self.options,[{"title":"Recovery","options":[option(200,25,12,4)]}])
        self.assertEqual(result["total"]["kcal"],1300)
    def test_averages_all_options(self):
        self.options["blue"]["breakfast"]=[option(400,20,60,8),option(600,30,80,12)]
        self.assertEqual(calculate_day(self.base,self.options)["total"]["kcal"],1200)

if __name__=="__main__":unittest.main()
