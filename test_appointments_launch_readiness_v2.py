"""Admin-only readiness for future bookings held in Google Calendar."""
import unittest
from unittest.mock import patch

import app
import test_app as fixtures
import appointments_catalog_v2 as catalog
import appointments_google_v2 as google
import appointments_launch_readiness_v2 as readiness

PATH = "/api/v2/admin/appointments/checkout/google-readiness"


class BookingGoogleReadinessTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin

    def new_professional(self):
        with app.connect() as c:
            return catalog.save_professional(c, {
                "name": "Profissional de teste",
                "email": "readiness-test@invalid.test",
                "active": True,
                "presencial_enabled": True,
                "online_enabled": True,
                "service_ids": ["the-mile-wellness-first"],
            })

    def test_admin_only_no_secrets_and_no_customer_data(self):
        self.assertEqual(fixtures.Client().request(PATH, "GET")["status"], 401)
        self.assertEqual(self.admin.request(PATH, "POST", {})["status"], 404)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.admin.request(PATH, "GET")["status"], 404)
        response = self.admin.request(PATH, "GET")
        self.assertEqual(response["status"], 200)
        body = response["body"]
        self.assertTrue(body["read_only"])
        self.assertFalse(body["customer_data_exposed"])
        self.assertFalse(body["external_calendar_events_modified"])
        self.assertNotIn("refresh_secret", str(body))
        self.assertNotIn("busy_calendar_ids", str(body))

    def test_count_only_active_professionals_with_active_service(self):
        prof = self.new_professional()
        result = self.admin.request(PATH, "GET")
        self.assertEqual(result["status"], 200)
        body = result["body"]
        self.assertEqual(body["professionals_to_check"], 1)
        self.assertEqual(body["professionals_blocking_google"], 0)
        self.assertFalse(body["all_professionals_blocking_google"])
        self.assertIn("Profissional de teste",
                      body["professionals_missing_google_blocking"])
        with patch.object(google, "configured", return_value=True), patch.object(
            google, "status", return_value={
                "connected": True,
                "busy_check_active": True,
            }
        ):
            result = self.admin.request(PATH, "GET")
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["body"]["professionals_blocking_google"], 1)
        self.assertTrue(result["body"]["all_professionals_blocking_google"])
        self.assertEqual(result["body"]["professionals_missing_google_blocking"], [])


if __name__ == "__main__":
    unittest.main()
