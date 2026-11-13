"""First appointments backoffice shell: route isolation and honest empty state."""
import unittest
from unittest.mock import patch

import test_app as fixtures
import app


class AppointmentsBackofficeShellTests(unittest.TestCase):
    def test_admin_route_and_assets_are_available(self):
        with patch.object(app, "SITE_ROLE", "admin"):
            client = fixtures.Client()
            page = client.request("/admin-appointments")
            self.assertEqual(page["status"], 200)
            self.assertIn(b"Agendamentos", page["body"])
            self.assertIn(b"Sesami", page["body"])
            self.assertIn(b"/api/me", client.request("/admin-appointments.js")["body"])
            self.assertEqual(client.request("/admin-appointments.js")["status"], 200)
            self.assertEqual(client.request("/admin-appointments.css")["status"], 200)
            self.assertEqual(page["headers"]["Cache-Control"], "no-store")

    def test_player_service_does_not_expose_admin_shell(self):
        with patch.object(app, "SITE_ROLE", "player"):
            for route in ("/admin-appointments", "/admin-appointments.js",
                          "/admin-appointments.css"):
                with self.subTest(route=route):
                    self.assertEqual(fixtures.Client().request(route)["status"], 404)

    def test_shared_navigation_has_agendamentos(self):
        with patch.object(app, "SITE_ROLE", "admin"):
            navigation = fixtures.Client().request("/admin-nav-shell.js")
            self.assertEqual(navigation["status"], 200)
            self.assertIn(b"tm-admin-nav-appointments", navigation["body"])
            self.assertIn(b"/admin-appointments", navigation["body"])


if __name__ == "__main__":
    unittest.main()
