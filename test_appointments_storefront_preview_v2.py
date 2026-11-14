"""Unauthenticated but strictly read-only, privacy-safe storefront preview.

Exercises exact availability shared with the private backoffice. Real Shopify
checkout and Sesami sync are explicitly not enabled.
"""
import json
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import app
import test_app as fixtures
import appointments_storefront_preview_v2 as storefront


class PublicStorefrontPreviewTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.guest = fixtures.Client()
        self.preview = patch.dict("os.environ", {"MILE_BOOKING_PREVIEW_ENABLED": "1"})
        self.preview.start()
        self.addCleanup(self.preview.stop)
        self.private = "/api/v2/admin/appointments"
        self.public = "/api/v2/public/appointments"
        cat = self.admin.request(self.private + "/catalog")["body"]
        self.first = next(s for s in cat["services"] if s["duration_minutes"] == 90)
        self.follow = next(s for s in cat["services"] if s["duration_minutes"] == 45)
        result = self.admin.request(self.private + "/professionals", "POST", {
            "name": "Profissional Publica",
            "email": "secreto-interno@the-mile.test",
            "active": True,
            "presencial_enabled": True,
            "online_enabled": True,
            "service_ids": [self.first["id"], self.follow["id"]],
        })
        self.assertEqual(result["status"], 201, result)
        self.pid = result["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() +
                    timedelta(days=2)).isoformat()
        result = self.admin.request(self.private + "/availability", "POST", {
            "professional_id": self.pid, "date": self.day,
            "start": "09:00", "end": "13:00",
        })
        self.assertEqual(result["status"], 201, result)

    def url(self, suffix, service=None, mode="presencial", **extra):
        return self.public + "/" + suffix + "?" + urlencode({
            "professional_id": self.pid,
            "service_id": service or self.first["id"],
            "mode": mode, **extra,
        })

    def month(self, service=None, mode="presencial"):
        return self.guest.request(self.url(
            "calendar-month", service, mode, month=self.day[:7]))

    def slots(self, service=None, mode="presencial"):
        return self.guest.request(self.url(
            "slots", service, mode, date=self.day))

    def test_public_catalog_is_live_and_scrubs_all_private_fields(self):
        result = self.guest.request(self.public + "/catalog",
                                    origin="https://www.themile.pt")
        self.assertEqual(result["status"], 200, result)
        self.assertEqual(result["headers"]["Access-Control-Allow-Origin"],
                         "https://www.themile.pt")
        self.assertEqual(result["headers"]["Vary"], "Origin")
        self.assertEqual(result["headers"]["Cache-Control"], "no-store")
        body = result["body"]
        self.assertTrue(body["preview_only"])
        self.assertFalse(body["checkout_enabled"])
        self.assertFalse(body["sesami_integrated"])
        self.assertEqual(body["timezone"], "Europe/Lisbon")
        self.assertEqual(body["interval_minutes"], 15)
        first = next(x for x in body["services"] if x["id"] == self.first["id"])
        self.assertEqual(first["duration_minutes"], 90)
        self.assertEqual(first["formats"]["presencial"]["price_cents"],
                         self.first["formats"]["presencial"]["price_cents"])
        self.assertIn(self.pid, first["professional_ids"])
        person = next(x for x in body["professionals"] if x["id"] == self.pid)
        self.assertEqual(person["name"], "Profissional Publica")
        self.assertEqual(person["modes"], ["presencial", "online"])
        raw = json.dumps(body)
        for private in ("secreto-interno@", "customer_email", "customer_phone",
                        "shopify_variant_id", "shopify_product_id", "note",
                        "csrf", "photo_data", "google_event_id", "payment_status"):
            self.assertNotIn(private, raw)

    def test_month_and_day_match_admin_and_use_exact_service_duration(self):
        month = self.month()
        self.assertEqual(month["status"], 200, month)
        days = month["body"]["days"]
        date = next(row for row in days if row["date"] == self.day)
        self.assertTrue(date["available"])
        self.assertEqual(set(date), {"date", "available"})
        self.assertEqual(month["body"]["sesami_integrated"], False)
        day = self.slots()
        self.assertEqual(day["status"], 200, day)
        self.assertEqual(len(day["body"]["slots"]), 11)
        self.assertEqual(day["body"]["slots"][0], {"start": "09:00", "end": "10:30"})
        self.assertEqual(day["body"]["slots"][-1], {"start": "11:30", "end": "13:00"})
        self.assertEqual(self.slots(self.follow["id"])["body"]["slots"][-1],
                         {"start": "12:15", "end": "13:00"})
        self.assertEqual(len(self.slots(self.follow["id"])["body"]["slots"]), 14)
        self.assertEqual(self.slots(mode="online")["body"]["slots"], day["body"]["slots"])

    def test_blocked_days_and_internal_booking_are_reflected_immediately(self):
        self.assertEqual(len(self.slots()["body"]["slots"]), 11)
        booked = self.admin.request(self.private + "/bookings", "POST", {
            "professional_id": self.pid, "service_id": self.first["id"],
            "mode": "online", "date": self.day, "start": "09:00",
            "customer_name": "Sensitive Customer",
            "customer_email": "never-public@example.pt",
        })
        self.assertEqual(booked["status"], 201, booked)
        result = self.slots()
        self.assertEqual(result["status"], 200)
        self.assertEqual(len(result["body"]["slots"]), 5)
        self.assertNotIn("Sensitive", json.dumps(result["body"]))
        self.assertNotIn("never-public", json.dumps(result["body"]))
        self.assertEqual(self.admin.request(self.private + "/blocks", "POST", {
            "professional_id": self.pid, "date": self.day,
            "start": "10:30", "end": "13:00", "note": "Private appointment",
        })["status"], 201)
        self.assertEqual(self.slots()["body"]["slots"], [])
        active = next(row for row in self.month()["body"]["days"] if row["date"] == self.day)
        self.assertFalse(active["available"])
        self.assertNotIn("Private appointment", json.dumps(self.month()["body"]))

    def test_invalid_pairs_dates_and_unrelated_origins(self):
        self.assertEqual(self.guest.request(self.url(
            "slots", service="unknown", date=self.day))["status"], 404)
        self.assertEqual(self.guest.request(self.url(
            "slots", date="2020-01-01"))["status"], 400)
        self.assertEqual(self.guest.request(self.url(
            "calendar-month", month="2035-01"))["status"], 400)
        self.assertEqual(self.guest.request(self.url(
            "calendar-month", month="2026-13"))["status"], 400)
        self.assertEqual(self.guest.request(self.url(
            "slots", mode="not-valid", date=self.day))["status"], 400)
        self.assertEqual(self.guest.request(
            self.public + "/catalog?extra=true")["status"], 400)
        self.assertEqual(self.guest.request(
            self.public + "/slots?date=" + self.day)["status"], 400)
        self.assertEqual(self.guest.request(
            self.public + "/catalog", origin="https://evil.example")["status"], 403)

    def test_read_only_and_separated_from_admin_security(self):
        self.assertEqual(self.guest.request(self.private + "/catalog")["status"], 401)
        self.assertEqual(self.guest.request(
            self.public + "/bookings")["status"], 404)
        self.assertEqual(self.guest.request(
            self.public + "/catalog", "POST", {})["status"], 404)
        self.assertEqual(self.guest.request(
            self.public + "/checkout/holds", "POST", {})["status"], 404)
        with patch.dict("os.environ", {"MILE_BOOKING_PREVIEW_ENABLED": "0"}):
            self.assertEqual(self.guest.request(
                self.public + "/catalog")["status"], 404)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.guest.request(
                self.public + "/catalog")["status"], 404)

    def test_inactive_professional_is_not_published(self):
        profile = next(x for x in self.admin.request(self.private + "/catalog")
                       ["body"]["professionals"] if x["id"] == self.pid)
        profile["active"] = False
        result = self.admin.request(self.private + "/professionals/"+self.pid,
                                    "PUT", profile)
        self.assertEqual(result["status"], 200, result)
        public = self.guest.request(self.public + "/catalog")["body"]
        self.assertFalse(any(x["id"] == self.pid for x in public["professionals"]))
        self.assertEqual(self.month()["status"], 404)


if __name__ == "__main__":
    unittest.main()
