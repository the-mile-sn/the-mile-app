"""Fail-closed integration checks for the production-based consumption pilot."""
import importlib.util
import unittest
from unittest.mock import patch
import consumption_source_v2

class ConsumptionIntegrationGate(unittest.TestCase):
    def test_production_adapter_available(self):
        self.assertIsNotNone(importlib.util.find_spec("food_plan_player_v2"))
        self.assertIsNotNone(importlib.util.find_spec("consumption_source_v2"))

    def test_unpublished_peri_events_fail_closed(self):
        # A previously disabled phase is now valid only with a visible,
        # event-matched published prescription. No database is needed here.
        with patch.object(consumption_source_v2.plans,"player_peri_days",return_value=[]):
            self.assertIsNone(consumption_source_v2.current_source(
                None,"athlete","2026-11-11","pre_training","event"))
            self.assertIsNone(consumption_source_v2.current_source(
                None,"athlete","2026-11-11","intra_match","game"))

if __name__ == "__main__":
    unittest.main()
