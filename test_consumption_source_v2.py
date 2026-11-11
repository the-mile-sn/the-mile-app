"""Production-adapter contract checks; no database or player data required."""
import unittest
from unittest.mock import patch
import consumption_source_v2 as source

class SourceContractTests(unittest.TestCase):
    def test_published_basic_meal_preserves_original_food_snapshot(self):
        option={"title":"Opção A","foods":[{"id":"food1","grams":100}]}
        published={"draft_id":"draft1","content":{"meals":[{"name":"Pequeno almoço","options":[option]}]}}
        colors={"2026-11-11":{"breakfast":{"color":"green","source":"manual"}}}
        with patch.object(source.choices,"valid_key"), \
             patch("microcycles_v2.get_model",return_value={"classifications":[]}), \
             patch("microcycles_v2.list_matches",return_value=[]), \
             patch("calendar_v2.classify_range",return_value=[{"date":"2026-11-11"}]), \
             patch("calendar_v2.effective_days",return_value=[{"date":"2026-11-11"}]), \
             patch("calendar_v2.effective_colors",return_value=colors), \
             patch.object(source.plans,"_approved",return_value={"Plano verde":published}), \
             patch.object(source.plans,"_library",return_value={}), \
             patch.object(source.plans,"_option_totals",return_value={}), \
             patch.object(source.plans,"_option_items",return_value=[]):
            result=source.current_source(None,"athlete","2026-11-11","breakfast")
        self.assertEqual(result["draft_id"],"draft1")
        self.assertEqual(result["color"],"green")
        self.assertEqual(result["options"][0]["foods"],option["foods"])
        self.assertEqual(result["options"][0]["option_ref"],source.choices.option_ref(option))

    def test_missing_publication_fails_closed(self):
        colors={"2026-11-11":{"breakfast":{"color":"green"}}}
        with patch.object(source.choices,"valid_key"), \
             patch("microcycles_v2.get_model",return_value={"classifications":[]}), \
             patch("microcycles_v2.list_matches",return_value=[]), \
             patch("calendar_v2.classify_range",return_value=[{"date":"2026-11-11"}]), \
             patch("calendar_v2.effective_days",return_value=[{"date":"2026-11-11"}]), \
             patch("calendar_v2.effective_colors",return_value=colors), \
             patch.object(source.plans,"_approved",return_value={}):
            self.assertIsNone(source.current_source(None,"athlete","2026-11-11","breakfast"))

if __name__=="__main__":
    unittest.main()
