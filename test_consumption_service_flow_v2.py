"""End-to-end service-layer consumption test: published option -> nutrition -> SQL -> read.

Uses an isolated in-memory database and mocks only the external published-plan
lookup; no production player records are read or modified.
"""
import sqlite3
import unittest
from unittest.mock import patch
import consumption_source_v2 as source
import consumption_nutrition_v2 as nutrition
import consumption_records_v2 as records

class ConsumptionServiceFlowTests(unittest.TestCase):
    def test_published_option_to_saved_record_and_back(self):
        db=sqlite3.connect(":memory:")
        db.row_factory=sqlite3.Row
        try:
            records.initialize(db)
            option={"title":"Almoço A","foods":[
                {"id":"rice","grams":120},
                {"kind":"supplement","label":"Vitamina D"}]}
            library={"rice":{"id":"rice","active":1,"variant":"plain",
                     "display_name":"Arroz","kcal":100,"protein_g":2,
                     "carbs_g":20,"fat_g":1}}
            colors={"2026-11-11":{"lunch":{"color":"green","source":"manual"}}}
            published={"draft_id":"published-1","content":{"meals":[
                {"name":"Almoço","options":[option]}]}}
            with patch("microcycles_v2.get_model",return_value={"classifications":[]}), \
                 patch("microcycles_v2.list_matches",return_value=[]), \
                 patch("calendar_v2.classify_range",return_value=[{"date":"2026-11-11"}]), \
                 patch("calendar_v2.effective_days",return_value=[{"date":"2026-11-11"}]), \
                 patch("calendar_v2.effective_colors",return_value=colors), \
                 patch.object(source.plans,"_approved",return_value={"Plano verde":published}), \
                 patch.object(source.plans,"_library",return_value=library), \
                 patch.object(source.plans,"_option_totals",return_value={}), \
                 patch.object(source.plans,"_option_items",return_value=[]):
                current=source.current_source(db,"jorge","2026-11-11","lunch")
            self.assertEqual(current["options"][0]["foods"][0]["display_name"],"Arroz")
            self.assertEqual(current["options"][0]["option_ref"],source.choices.option_ref(option))
            calculated=nutrition.calculate(current["options"][0],library,"all")
            records.save_record(db,athlete_id="jorge",meal_date="2026-11-11",
                meal_key="lunch",status="all",option_ref=current["options"][0]["option_ref"],
                source_draft_id=current["draft_id"],prescription={"option":option},
                consumed_foods=calculated["foods"],nutrition=calculated["nutrition"])
            result=records.read_range(db,"jorge","2026-11-11","2026-11-11")
            self.assertEqual(len(result),1)
            self.assertAlmostEqual(result[0]["nutrition"]["kcal"],120)
            self.assertEqual([x["id"] for x in result[0]["consumed_foods"]],["rice"])
            self.assertEqual(result[0]["prescription"]["option"],option)
            self.assertEqual(records.read_range(db,"other","2026-11-11","2026-11-11"),[])
        finally:
            db.close()

if __name__=="__main__":
    unittest.main()
