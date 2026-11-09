"""Timings are metadata: nutritional grams and alternatives remain untouched."""
import unittest
from food_plan_drafts_v2 import validate


def sample(splits=None, plan_type="Plano Peri-jogo"):
    food={"id":"gel","grams":60,"display_quantity":"1 un"}
    if splits is not None:food["timing_splits"]=splits
    return {"name":"Teste","plan_type":plan_type,"meals":[{"name":"Intra-jogo","options":[
        {"title":"Opção 1","foods":[food],"notes":[]}
    ]}]}


class PeriTimingSplitTests(unittest.TestCase):
    def test_half_and_half_preserves_original_grams(self):
        fractions=[{"timing":"warmup","share":0.5},{"timing":"half_time","share":0.5}]
        result=validate(sample(fractions))
        food=result["meals"][0]["options"][0]["foods"][0]
        self.assertEqual(food["grams"],60)
        self.assertEqual(food["display_quantity"],"1 un")
        self.assertEqual(food["timing_splits"],fractions)

    def test_unsplit_old_plan_still_valid(self):
        food=validate(sample())["meals"][0]["options"][0]["foods"][0]
        self.assertEqual(food["grams"],60)
        self.assertNotIn("timing_splits",food)

    def test_incomplete_portions_are_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_timing_splits"):
            validate(sample([{"timing":"warmup","share":0.5},{"timing":"half_time","share":0.3}]))

    def test_duplicate_moments_are_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_timing_splits"):
            validate(sample([{"timing":"warmup","share":0.5},{"timing":"warmup","share":0.5}]))

    def test_metadata_excluded_from_other_plan_types(self):
        food=validate(sample([{"timing":"warmup","share":1}],plan_type="Plano azul"))["meals"][0]["options"][0]["foods"][0]
        self.assertNotIn("timing_splits",food)


if __name__=="__main__":
    unittest.main()
