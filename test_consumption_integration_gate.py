"""Fail-closed integration checks for the production-based consumption pilot."""
import importlib.util
import unittest
from unittest.mock import patch
import consumption_source_v2

class ConsumptionIntegrationGate(unittest.TestCase):
    def test_production_adapter_available(self):
        self.assertIsNotNone(importlib.util.find_spec("food_plan_player_v2"))
        self.assertIsNotNone(importlib.util.find_spec("consumption_source_v2"))

    def test_peri_events_fail_closed(self):
        with patch.object(consumption_source_v2.choices,"valid_key",return_value=None):
            self.assertIsNone(consumption_source_v2.current_source(None,"athlete","2026-11-11","pre_training","event"))

if __name__ == "__main__":
    unittest.main()
