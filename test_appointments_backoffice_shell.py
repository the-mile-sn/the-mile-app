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
            # The schedule DOM must load its controller, after the catalogue's
            # CustomEvent publisher. Otherwise professional/service selects stay empty.
            body = page["body"]
            main_script = b'src="/admin-appointments.js?v='
            schedule_script = b'src="/admin-appointments-schedule.js?v='
            self.assertIn(main_script, body)
            self.assertIn(schedule_script, body)
            self.assertLess(body.index(main_script), body.index(schedule_script))
            bookings_script = b'src="/admin-appointments-bookings.js?v='
            self.assertIn(bookings_script, body)
            self.assertLess(body.index(schedule_script), body.index(bookings_script))
            self.assertEqual(client.request("/admin-appointments-bookings.js")["status"], 200)
            google_script = b'src="/admin-appointments-google.js?v='
            self.assertIn(google_script, body)
            self.assertLess(body.index(bookings_script), body.index(google_script))
            self.assertEqual(client.request("/admin-appointments-google.js")["status"], 200)
            self.assertIn(b'id="tm-appt-google-calendar-list"', body)
            booking_markup = body.split(b'id="tm-appt-booking-dialog"', 1)[1]
            self.assertIn(b'id="tm-appt-cal-days"', booking_markup)
            self.assertIn(b'id="tm-appt-time-options"', booking_markup)
            self.assertIn(b'type="hidden" id="tm-appt-booking-date"', booking_markup)
            self.assertIn(b'type="hidden" id="tm-appt-booking-start"', booking_markup)
            self.assertNotIn(b'type="date" id="tm-appt-booking-date"', booking_markup)
            booking_js = client.request("/admin-appointments-bookings.js")["body"]
            self.assertIn(b"/calendar-month?", booking_js)
            self.assertIn(b"/slots-preview?", booking_js)
            schedule = client.request("/admin-appointments-schedule.js")
            self.assertEqual(schedule["status"], 200)
            self.assertIn(b'tm:appointments-catalog', schedule["body"])
            self.assertEqual(client.request("/admin-appointments.css")["status"], 200)
            self.assertEqual(page["headers"]["Cache-Control"], "no-store")

    def test_player_service_does_not_expose_admin_shell(self):
        with patch.object(app, "SITE_ROLE", "player"):
            for route in ("/admin-appointments", "/admin-appointments.js",
                          "/admin-appointments-schedule.js", "/admin-appointments-bookings.js", "/admin-appointments-google.js", "/admin-appointments.css"):
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
