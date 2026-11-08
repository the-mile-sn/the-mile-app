"""Only presentation is split; one original food remains in nutrition totals."""
import unittest
from food_plan_player_v2 import _option_items, _option_totals


class PeriSplitPlayerTests(unittest.TestCase):
    def setUp(self):
        self.library={"gel":{"id":"gel","display_name":"Gel","variant":"plain",
          "edible_fraction":1.0,"kcal":100.0,"protein_g":0.0,
          "carbs_g":25.0,"fat_g":0.0}}

    def test_half_unit_in_two_moments(self):
        option={"foods":[{"id":"gel","grams":60,"display_quantity":"1 un",
          "timing_splits":[{"timing":"warmup","share":0.5},{"timing":"half_time","share":0.5}]}]}
        items=_option_items(option,self.library)
        self.assertEqual([item["quantity"] for item in items],["½ un","½ un"])
        self.assertEqual([item["timing"] for item in items],["warmup","half_time"])
        self.assertEqual(_option_totals(option,self.library)["kcal"],60.0)

    def test_old_unsplit_plan_still_one_item(self):
        option={"foods":[{"id":"gel","grams":60,"display_quantity":"1 un",
          "timing":"half_time"}]}
        items=_option_items(option,self.library)
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]["quantity"],"1 un")
        self.assertEqual(items[0]["timing"],"half_time")

    def test_split_with_compound_display_keeps_full_original(self):
        option={"foods":[{"id":"gel","grams":60,"display_quantity":"1 un / 60 g",
          "timing_splits":[{"timing":"warmup","share":0.5},{"timing":"half_time","share":0.5}]}]}
        self.assertEqual([item["quantity"] for item in _option_items(option,self.library)],
                         ["50% de 1 un / 60 g","50% de 1 un / 60 g"])
        self.assertEqual(_option_totals(option,self.library)["carbs_g"],15.0)


if __name__=="__main__":
    unittest.main()
