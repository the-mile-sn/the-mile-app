"""Stage 1 opt-in configuration for individual nutrition meal option selection.

This stage changes only athlete preferences, not planned meals or player display.
"""
import unittest

import test_app
import microcycles_v2

Client = test_app.Client


class MealOptionSelectionProfileTests(unittest.TestCase):
    def setUp(self):
        test_app.PortalTest.setUp(self)

    def create_athlete(self, name, username):
        response = self.admin.request("/api/v2/athletes", "POST", {
            "name": name, "username": username,
            "password": "initial-player-pass-123", "sex": "M", "weight_kg": 75,
        })
        self.assertEqual(response["status"], 201, response)
        self.assertFalse(response["body"]["athlete"]["meal_option_selection_enabled"])
        return response["body"]["athlete"]["id"]

    def payload(self, name, **extras):
        return {"name": name, "sex": "M", "weight_kg": 75,
                "height_cm": None, "profile_notes": "", **extras}

    def test_default_off_and_explicit_opt_in_keeps_other_players_unchanged(self):
        a = self.create_athlete("Atleta Primeiro", "primeiro")
        b = self.create_athlete("Atleta Segundo", "segundo")
        profile_a = f"/api/v2/athletes/{a}/profile"
        profile_b = f"/api/v2/athletes/{b}/profile"
        self.assertIs(self.admin.request(profile_a)["body"]["details"]["meal_option_selection_enabled"], False)
        self.assertIs(self.admin.request(profile_b)["body"]["details"]["meal_option_selection_enabled"], False)
        self.assertIs(self.admin.request(f"/api/v2/athletes/{a}/microcycles")["body"]["athlete"]["meal_option_selection_enabled"], False)

        activated = self.admin.request(
            profile_a, "PUT", self.payload("Atleta Primeiro", meal_option_selection_enabled=True))
        self.assertEqual(activated["status"], 200, activated)
        self.assertIs(activated["body"]["athlete"]["meal_option_selection_enabled"], True)
        self.assertIs(self.admin.request(profile_a)["body"]["details"]["meal_option_selection_enabled"], True)
        self.assertIs(self.admin.request(f"/api/v2/athletes/{a}/microcycles")["body"]["athlete"]["meal_option_selection_enabled"], True)
        self.assertIs(self.admin.request(profile_b)["body"]["details"]["meal_option_selection_enabled"], False)

        # Old Planning profile forms omit the preference; this must not reset it.
        old_form = self.admin.request(profile_a, "PUT", self.payload("Atleta Primeiro"))
        self.assertEqual(old_form["status"], 200, old_form)
        self.assertIs(old_form["body"]["athlete"]["meal_option_selection_enabled"], True)

        with test_app.app.connect() as c:
            microcycles_v2.initialize(c)
            stored = c.execute(
                "SELECT meal_option_selection_enabled FROM v2_athletes WHERE id=?", (a,)
            ).fetchone()["meal_option_selection_enabled"]
            self.assertEqual(stored, 1)

        restored = self.admin.request(
            profile_a, "PUT", self.payload("Atleta Primeiro", meal_option_selection_enabled=False))
        self.assertEqual(restored["status"], 200, restored)
        self.assertIs(self.admin.request(profile_a)["body"]["details"]["meal_option_selection_enabled"], False)

    def test_only_admin_can_change_setting_and_invalid_values_rejected(self):
        athlete = self.create_athlete("Atleta Seguro", "seguro")
        route = f"/api/v2/athletes/{athlete}/profile"
        for invalid in (None, "true", 1, 0, "false", [], {}):
            bad = self.admin.request(route, "PUT", self.payload(
                "Atleta Seguro", meal_option_selection_enabled=invalid))
            self.assertEqual(bad["status"], 400, (invalid, bad))
            self.assertIs(self.admin.request(route)["body"]["details"]["meal_option_selection_enabled"], False)

        anonymous = Client()
        self.assertEqual(anonymous.request(route)["status"], 401)
        self.assertEqual(anonymous.request(route, "PUT", self.payload(
            "Atleta Seguro", meal_option_selection_enabled=True))["status"], 401)

        player = Client()
        login = player.request("/api/login", "POST", {
            "identifier": "seguro", "password": "initial-player-pass-123",
        })
        self.assertEqual(login["status"], 200, login)
        player.request("/api/me")
        self.assertEqual(player.request(route)["status"], 403)
        self.assertEqual(player.request(route, "PUT", self.payload(
            "Atleta Seguro", meal_option_selection_enabled=True))["status"], 403)
        self.assertIs(self.admin.request(route)["body"]["details"]["meal_option_selection_enabled"], False)


if __name__ == "__main__":
    unittest.main()
