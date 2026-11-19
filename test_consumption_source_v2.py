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
        self.assertEqual(result["options"][0]["foods"][0]["id"],"food1")
        self.assertEqual(result["options"][0]["foods"][0]["display_name"],"Alimento")
        self.assertEqual(option["foods"],[{"id":"food1","grams":100}])
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

class PeriConsumptionSourceContractTests(unittest.TestCase):
    """The post-training source must match only the current published event."""

    def setUp(self):
        self.day = "2026-11-19"
        self.food = {"id":"food1","grams":25,"kind":"food"}
        self.raw = {"title":"Recovery","foods":[self.food]}
        self.publication = {"draft_id":"pub1","content":{"meals":[
            {"name":"Pós-treino","options":[self.raw]}]}}
        self.visible = [{"event_id":"event1","event_date":self.day,
                         "kind":"training","selection_phase":"post_training",
                         "options":[{"option_ref":source.choices.option_ref(self.raw),
                                     "source_draft_id":"pub1"}]}]

    def _resolve(self, visible=None, plans=None, **kwargs):
        with patch.object(source.plans,"player_peri_days",
                          return_value=self.visible if visible is None else visible), \
             patch.object(source.plans,"_approved",
                          return_value={"Plano Peri-treino":self.publication} if plans is None else plans), \
             patch.object(source.plans,"_library",
                          return_value={"food1":{"display_name":"Whey shake"}}), \
             patch.object(source.plans,"_option_totals",return_value={}), \
             patch.object(source.plans,"_option_items",return_value=[]):
            return source.current_source(None,"athlete1",self.day,
                                         "post_training","event1",**kwargs)

    def test_published_post_training_option_uses_immutable_raw_foods(self):
        result=self._resolve()
        self.assertEqual(result["draft_id"],"pub1")
        self.assertIsNone(result["color"])
        self.assertEqual(result["options"][0]["option_ref"],source.choices.option_ref(self.raw))
        self.assertEqual(result["options"][0]["foods"][0]["display_name"],"Whey shake")
        self.assertEqual(self.raw["foods"],[self.food])
        self.assertEqual(result["options"][0]["foods"][0]["grams"],25)

    def test_missing_or_overridden_event_cannot_be_logged(self):
        self.assertIsNone(self._resolve(visible=[]))
        self.assertIsNone(self._resolve(visible=[dict(self.visible[0],event_id="other")]))
        self.assertIsNone(self._resolve(visible=[dict(self.visible[0],event_date="2026-11-18")]))
        self.assertIsNone(self._resolve(plans={}))

    def test_stale_or_ambiguous_published_option_fails_closed(self):
        bad=dict(self.visible[0],options=[{"option_ref":"stale","source_draft_id":"pub1"}])
        self.assertIsNone(self._resolve(visible=[bad]))
        self.assertIsNone(self._resolve(visible=self.visible*2))
        bad_draft=dict(self.visible[0],options=[{
            "option_ref":source.choices.option_ref(self.raw),"source_draft_id":"old"}])
        self.assertIsNone(self._resolve(visible=[bad_draft]))

    def test_rejects_color_switching_for_post_training(self):
        with self.assertRaisesRegex(ValueError,"invalid_consumed_color"):
            self._resolve(consumed_color="green")

    def test_other_peri_phases_remain_disabled(self):
        with patch.object(source.plans,"player_peri_days",
                          side_effect=AssertionError("unapproved event phase was resolved")):
            self.assertIsNone(source.current_source(
                None,"athlete1",self.day,"pre_training","event1"))
            self.assertIsNone(source.current_source(
                None,"athlete1",self.day,"post_match","event1"))

    def test_no_alternative_colors_for_peri_events(self):
        with patch.object(source.plans,"_approved",
                          side_effect=AssertionError("color lookup must not run")):
            self.assertEqual(source.available_alternative_colors(
                None,"athlete1",self.day,"post_training","event1"),[])


if __name__=="__main__":
    unittest.main()
