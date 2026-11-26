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

    def test_same_day_is_closed_online_until_professional_has_a_booking(self):
        import appointments_checkout_v2 as checkout
        from datetime import timezone
        # Pretend "today" is self.day at 08:00 in Lisbon.
        day = datetime.fromisoformat(self.day).date()
        now = datetime(day.year, day.month, day.day, 8, 0,
                       tzinfo=ZoneInfo("Europe/Lisbon")).astimezone(timezone.utc)
        with app.connect() as c:
            self.assertEqual(storefront.public_day(
                c, self.pid, self.follow["id"], "presencial", self.day, now=now)["slots"], [])
            month = storefront.public_month(
                c, self.pid, self.follow["id"], "presencial", self.day[:7], now=now)
            self.assertFalse(next(d for d in month["days"] if d["date"] == self.day)["available"])
            with self.assertRaisesRegex(ValueError, "same_day_unavailable"):
                checkout.start_hold(c, {"professional_id": self.pid,
                    "service_id": self.follow["id"], "mode": "presencial",
                    "date": self.day, "start": "11:00",
                    "idempotency_key": "same-day-closed-key-0001"},
                    "test", now=now, public=True)
            # Online consultations stay bookable the same day.
            self.assertTrue(storefront.public_day(
                c, self.pid, self.follow["id"], "online", self.day, now=now)["slots"])
            # The day after "today" is unaffected.
            self.assertFalse(checkout.same_day_closed(
                c, "the-mile", self.pid, day + timedelta(days=1), now))
        booked = self.admin.request(self.private + "/bookings", "POST", {
            "professional_id": self.pid, "service_id": self.follow["id"],
            "mode": "presencial", "date": self.day, "start": "09:00",
            "customer_name": "Já marcada", "customer_email": "", "customer_phone": ""})
        self.assertEqual(booked["status"], 201, booked)
        with app.connect() as c:
            starts = [x["start"] for x in storefront.public_day(
                c, self.pid, self.follow["id"], "presencial", self.day, now=now)["slots"]]
            self.assertIn("10:00", starts)
            month = storefront.public_month(
                c, self.pid, self.follow["id"], "presencial", self.day[:7], now=now)
            self.assertTrue(next(d for d in month["days"] if d["date"] == self.day)["available"])

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
        self.assertEqual(body["checkout_hold_minutes"], 15)
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

    def test_public_professional_photo_is_available_only_for_bookable_profiles(self):
        from test_admin_private_photo import sample_photo

        public_photo = self.public + "/professionals/" + self.pid + "/photo"
        admin_photo = self.private + "/professionals/" + self.pid + "/photo"
        self.assertEqual(self.guest.request(public_photo)["status"], 404)

        saved = self.admin.request(
            admin_photo, "PUT", {"photo": sample_photo()})
        self.assertEqual(saved["status"], 200, saved)

        catalog_response = self.guest.request(self.public + "/catalog")
        person = next(p for p in catalog_response["body"]["professionals"]
                      if p["id"] == self.pid)
        self.assertTrue(person["has_photo"])
        self.assertNotIn("photo_data", json.dumps(catalog_response["body"]))
        self.assertNotIn("photo_updated_at", json.dumps(catalog_response["body"]))
        self.assertNotIn("email", json.dumps(person))

        image = self.guest.request(public_photo, origin="https://themile.pt")
        self.assertEqual(image["status"], 200, image)
        self.assertEqual(image["headers"]["Content-Type"], "image/webp")
        self.assertEqual(image["headers"]["Cache-Control"], "no-store")
        self.assertEqual(image["headers"]["Access-Control-Allow-Origin"],
                         "https://themile.pt")
        self.assertEqual(image["body"][0:4], b"RIFF")
        self.assertEqual(image["body"][8:12], b"WEBP")
        self.assertNotIn(b"PRIVATE_CAMERA_DESCRIPTION", image["body"])

        self.assertEqual(self.guest.request(public_photo + "?other=1")["status"], 400)
        self.assertEqual(self.guest.request(
            public_photo, origin="https://evil.example")["status"], 403)
        self.assertEqual(self.guest.request(public_photo, "POST", {})["status"], 404)
        self.assertEqual(self.guest.request(
            self.public + "/professionals/" + "f"*32 + "/photo")["status"], 404)
        self.assertEqual(self.guest.request(
            self.public + "/professionals/not-an-id/photo")["status"], 404)

        unrelated = self.admin.request(self.private + "/professionals", "POST", {
            "name": "Sem Servico", "active": True, "email": "",
            "presencial_enabled": True, "online_enabled": True,
            "service_ids": [],
        })
        self.assertEqual(unrelated["status"], 201, unrelated)
        unrelated_id = unrelated["body"]["id"]
        self.assertEqual(self.admin.request(
            self.private + "/professionals/" + unrelated_id + "/photo",
            "PUT", {"photo": sample_photo()})["status"], 200)
        self.assertEqual(self.guest.request(
            self.public + "/professionals/" + unrelated_id + "/photo")["status"], 404)

        profile = next(x for x in self.admin.request(self.private + "/catalog")
                       ["body"]["professionals"] if x["id"] == self.pid)
        profile["active"] = False
        self.assertEqual(self.admin.request(
            self.private + "/professionals/" + self.pid, "PUT", profile)["status"], 200)
        self.assertEqual(self.guest.request(public_photo)["status"], 404)

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

    def test_any_professional_merges_slots_without_duplicates(self):
        second = self.admin.request(self.private + "/professionals", "POST", {
            "name": "Segunda Profissional",
            "email": "outra-privada@the-mile.test",
            "active": True, "presencial_enabled": True,
            "online_enabled": True,
            "service_ids": [self.first["id"], self.follow["id"]],
        })
        self.assertEqual(second["status"], 201, second)
        other_id = second["body"]["id"]
        added = self.admin.request(self.private + "/availability", "POST", {
            "professional_id": other_id, "date": self.day,
            "start": "10:00", "end": "14:00",
        })
        self.assertEqual(added["status"], 201, added)
        combined = self.guest.request(self.url(
            "slots", service=self.first["id"], mode="online",
            date=self.day).replace(self.pid, "any"))
        self.assertEqual(combined["status"], 200, combined)
        result = combined["body"]
        self.assertTrue(result["any_professional"])
        self.assertTrue(result["provisional_assignment"])
        slots = result["slots"]
        self.assertEqual(len(slots), 15)
        self.assertEqual(len({slot["start"] for slot in slots}), len(slots))
        self.assertEqual(slots[0]["start"], "09:00")
        self.assertEqual(slots[-1]["start"], "12:30")
        both = next(slot for slot in slots if slot["start"] == "10:00")
        self.assertEqual(both["professional_count"], 2)
        self.assertIn(both["suggested_professional_id"], {self.pid, other_id})
        self.assertEqual(slots[0]["professional_count"], 1)
        self.assertEqual(slots[-1]["professional_count"], 1)
        month = self.guest.request(self.url(
            "calendar-month", service=self.first["id"], mode="online",
            month=self.day[:7]).replace(self.pid, "any"))
        self.assertEqual(month["status"], 200, month)
        self.assertTrue(next(x for x in month["body"]["days"]
                             if x["date"] == self.day)["available"])
        # A booking of one professional must not hide the other's time.
        booked = self.admin.request(self.private + "/bookings", "POST", {
            "professional_id": self.pid, "service_id": self.first["id"],
            "mode": "online", "date": self.day, "start": "10:00",
            "customer_name": "Cliente Reserva",
        })
        self.assertEqual(booked["status"], 201, booked)
        remaining = self.guest.request(self.url(
            "slots", service=self.first["id"], mode="online",
            date=self.day).replace(self.pid, "any"))
        self.assertEqual(remaining["status"], 200, remaining)
        at_ten = next(x for x in remaining["body"]["slots"]
                      if x["start"] == "10:00")
        self.assertEqual(at_ten["professional_count"], 1)
        self.assertEqual(at_ten["suggested_professional_id"], other_id)
        self.assertNotIn("outra-privada@", json.dumps(remaining["body"]))

    def test_any_professional_only_includes_active_service_mode_matches(self):
        invalid = self.guest.request(self.url(
            "slots", service=self.first["id"], mode="fake",
            date=self.day).replace(self.pid, "any"))
        self.assertEqual(invalid["status"], 400)
        other_service = "f" * 32
        missing = self.guest.request(self.url(
            "slots", service=other_service, date=self.day).replace(self.pid, "any"))
        self.assertEqual(missing["status"], 404)
        # Only the one known provider matches this service today.
        only = self.guest.request(self.url(
            "slots", service=self.first["id"], mode="presencial",
            date=self.day).replace(self.pid, "any"))
        self.assertEqual(only["status"], 200, only)
        self.assertEqual(len(only["body"]["slots"]), 11)
        self.assertTrue(all(x["professional_count"] == 1
                            for x in only["body"]["slots"]))
        self.assertEqual(only["body"]["slots"][0]["suggested_professional_id"],
                         self.pid)

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
