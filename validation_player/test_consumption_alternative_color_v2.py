"""Regression checks for choosing a consumed color without changing the plan."""
import unittest
from unittest.mock import patch
import consumption_source_v2 as source

class AlternativeColorTests(unittest.TestCase):
    def test_invalid_consumed_color_is_rejected(self):
        with patch("microcycles_v2.get_model",return_value={"meals":[]}), \
             patch("microcycles_v2.list_matches",return_value=[]), \
             patch("calendar_v2.classify_range",return_value=[]), \
             patch("calendar_v2.effective_days",return_value={}), \
             patch("calendar_v2.effective_colors",return_value={"2026-11-11":{"lunch":{"color":"green"}}}):
            with self.assertRaisesRegex(ValueError,"invalid_consumed_color"):
                source.current_source(None,"athlete","2026-11-11","lunch",consumed_color="invalid")

    def test_alternatives_exclude_planned_and_unavailable(self):
        def resolve(c, athlete, date, meal, event="", consumed_color=None):
            if consumed_color is None:
                return {"planned_color":"green","options":[{"option_ref":"planned"}]}
            if consumed_color == "yellow":
                return {"planned_color":"green","options":[{"option_ref":"other"}]}
            return None
        with patch.object(source,"current_source",side_effect=resolve), \
             patch.object(source.plans,"COLORS",{"green":"g","yellow":"y","red":"r"}):
            self.assertEqual(source.available_alternative_colors(None,"athlete","2026-11-11","lunch"),["yellow"])

    def test_no_alternatives_without_planned_meal(self):
        with patch.object(source,"current_source",return_value=None):
            self.assertEqual(source.available_alternative_colors(None,"athlete","2026-11-11","lunch"),[])

if __name__ == "__main__":
    unittest.main()
