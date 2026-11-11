"""Deployment gate: consumption API must resolve every required module.

This test deliberately fails while the production-based integration lacks
the approved-plan source adapter. Never deploy a partial pilot.
"""
import importlib.util
import unittest

class ConsumptionIntegrationGate(unittest.TestCase):
    def test_published_source_dependencies_available(self):
        self.assertIsNotNone(importlib.util.find_spec("food_plan_calendar_bridge_v2"),
            "BLOCK DEPLOY: meal_option_selection_v2.current_source requires the absent bridge")

if __name__ == "__main__":
    unittest.main()
