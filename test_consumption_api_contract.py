"""Safety checks for the consumption API integration on the player service."""
import pathlib
import unittest

APP = pathlib.Path(__file__).with_name("app.py").read_text(encoding="utf-8")

class ConsumptionApiContract(unittest.TestCase):
    def test_every_player_endpoint_checks_pilot_allowlist(self):
        endpoints = [
            "if path == '/api/v2/player/consumption-options' and method == 'GET':",
            "if path == '/api/v2/player/consumption-records' and method == 'PUT':",
            "if path == '/api/v2/player/consumption-records' and method == 'GET':",
            "if path == '/api/v2/player/consumption-foods' and method == 'GET':",
        ]
        for index, marker in enumerate(endpoints):
            self.assertIn(marker, APP)
            section = APP.split(marker, 1)[1]
            if index + 1 < len(endpoints):
                section = section.split(endpoints[index + 1], 1)[0]
            else:
                section = section.split("if path in ('/api/v2/player/calendar'", 1)[0]
            self.assertIn("MILE_CONSUMPTION_PILOT_ATHLETE_IDS", section)
            self.assertIn("user['role'] != 'player'", section)
            self.assertIn("v2_player_links", section)

    def test_consumption_is_separate_from_prescription(self):
        self.assertIn("consumption_records_v2.initialize(c)", APP)
        self.assertIn("consumption_source_v2.current_source", APP)
        self.assertNotIn("food_library_v2.list_foods(c, query=search", APP)
        self.assertNotIn("reference_g, kcal, protein_g", APP)

if __name__ == "__main__":
    unittest.main()
