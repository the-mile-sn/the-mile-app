"""Phase 3 appointments: dated availability, copy, manual blocks, preview, photos."""
import base64
import io
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from PIL import Image
import test_app as fixtures
import app
import appointments_catalog_v2 as catalogue
import appointments_availability_v2 as availability


def sample_photo():
    image = Image.new("RGB", (56, 48), (22, 129, 190))
    raw = io.BytesIO()
    image.save(raw, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(raw.getvalue()).decode()


class AvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.base = "/api/v2/admin/appointments"
        catalog = self.admin.request(self.base + "/catalog")["body"]
        self.first = next(s for s in catalog["services"] if s["duration_minutes"] == 90)
        self.follow = next(s for s in catalog["services"] if s["duration_minutes"] == 45)
        professional = {"name": "Nutricionista de Teste", "email": "test@example.pt",
                        "active": True, "presencial_enabled": True, "online_enabled": True,
                        "service_ids": [self.first["id"], self.follow["id"]]}
        res = self.admin.request(self.base + "/professionals", "POST", professional)
        self.assertEqual(res["status"], 201, res)
        self.pid = res["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() +
                    timedelta(days=2)).isoformat()

    def req(self, suffix, method="GET", payload=None):
        return self.admin.request(self.base + suffix, method, payload)

    def period(self, date=None, start="09:00", end="13:00", **extra):
        return dict(professional_id=self.pid, date=date or self.day,
                    start=start, end=end, **extra)

    def slots(self, sid=None, mode="presencial", date=None):
        return self.req("/slots-preview?professional_id=" + self.pid +
                        "&service_id=" + (sid or self.first["id"]) +
                        "&mode=" + mode + "&date=" + (date or self.day))

    def test_dated_availability_and_half_open_edges(self):
        self.assertEqual(self.req("/availability", "POST", self.period())["status"], 201)
        data = self.req("/schedule?professional_id=" + self.pid +
                        "&from=" + self.day + "&to=" + self.day)
        self.assertEqual(data["status"], 200)
        self.assertEqual([(p["start"], p["end"]) for p in data["body"]["availability"]],
                         [("09:00", "13:00")])
        self.assertEqual(data["body"]["blocks"], [])
        self.assertEqual(data["body"]["timezone"], "Europe/Lisbon")
        self.assertEqual(self.req("/availability", "POST",
                                  self.period(start="12:30", end="14:00"))["status"], 409)
        self.assertEqual(self.req("/availability", "POST",
                                  self.period(start="13:00", end="15:00"))["status"], 201)
        self.assertEqual(self.req("/availability", "POST",
                                  self.period(start="15:00", end="15:00"))["status"], 400)
        data = self.req("/schedule?professional_id=" + self.pid +
                        "&from=" + self.day + "&to=" + self.day)["body"]
        self.assertEqual(len(data["availability"]), 2)
        self.assertEqual(self.req("/availability/" + data["availability"][0]["id"],
                                  "DELETE")["status"], 200)
        self.assertEqual(self.req("/availability/" + data["availability"][0]["id"],
                                  "DELETE")["status"], 404)

    def test_slot_intervals_and_blocks_are_shared_by_modes(self):
        self.req("/availability", "POST", self.period())
        before = self.slots()
        self.assertEqual(before["status"], 200, before)
        self.assertTrue(before["body"]["preview_only"])
        self.assertFalse(before["body"]["includes_bookings"])
        self.assertFalse(before["body"]["includes_google"])
        self.assertEqual(before["body"]["slots"][0], {"start": "09:00", "end": "10:30"})
        self.assertEqual(before["body"]["slots"][-1], {"start": "11:30", "end": "13:00"})
        self.assertEqual(len(before["body"]["slots"]), 11)
        follow = self.slots(self.follow["id"])
        self.assertEqual(len(follow["body"]["slots"]), 14)
        self.assertEqual(follow["body"]["slots"][-1],
                         {"start": "12:15", "end": "13:00"})
        self.assertEqual(self.slots(mode="online")["body"]["slots"],
                         before["body"]["slots"])
        block = self.req("/blocks", "POST", self.period(start="10:15",
                                  end="11:00", note="Compromisso privado"))
        self.assertEqual(block["status"], 201)
        start_times = {s["start"] for s in self.slots()["body"]["slots"]}
        self.assertEqual(start_times, {"11:00", "11:15", "11:30"})
        self.assertEqual(self.slots(mode="online")["body"]["slots"],
                         self.slots()["body"]["slots"])
        self.assertEqual(self.req("/blocks/" + block["body"]["id"], "DELETE")["status"], 200)
        self.assertEqual(len(self.slots()["body"]["slots"]), 11)

    def test_copy_day_week_idempotence_and_overlap_rollbacks(self):
        self.req("/availability", "POST", self.period())
        dst = (datetime.fromisoformat(self.day).date() + timedelta(days=1)).isoformat()
        copy = dict(professional_id=self.pid, source_date=self.day,
                    target_date=dst, days=1)
        self.assertEqual(self.req("/availability/copy", "POST", copy)["body"]["created"], 1)
        self.assertEqual(self.req("/availability/copy", "POST", copy)["body"]["skipped"], 1)
        self.assertEqual(self.req("/availability/copy", "POST",
                                  {**copy, "target_date": self.day})["status"], 400)
        mon = availability.clean_date(self.day)
        mon = mon - timedelta(days=mon.weekday()) + timedelta(weeks=2)
        tue = mon + timedelta(days=1)
        next_mon = mon + timedelta(days=7)
        for date in (mon.isoformat(), tue.isoformat()):
            self.assertEqual(self.req("/availability", "POST",
                                      self.period(date=date))["status"], 201)
        week = dict(professional_id=self.pid, source_date=mon.isoformat(),
                    target_date=next_mon.isoformat(), days=7)
        self.assertEqual(self.req("/availability/copy", "POST", week)["body"]["created"], 2)
        self.assertEqual(self.req("/availability/copy", "POST", week)["body"]["skipped"], 2)
        overlap = (next_mon + timedelta(days=14)).isoformat()
        self.req("/availability", "POST", self.period(date=overlap,
                                                     start="09:30", end="14:00"))
        conflict = self.req("/availability/copy", "POST",
                            {**week, "target_date": overlap})
        self.assertEqual(conflict["status"], 409)
        day2 = (next_mon + timedelta(days=15)).isoformat()
        existing = self.req("/schedule?professional_id=" + self.pid +
                            "&from=" + day2 + "&to=" + day2)
        self.assertEqual(existing["body"]["availability"], [])

    def test_rejected_dates_and_inactive_service(self):
        self.assertEqual(self.req("/availability", "POST",
                                  self.period(date="2026-02-31"))["status"], 400)
        self.assertEqual(self.req("/availability", "POST",
                                  self.period(start="13:00", end="09:00"))["status"], 400)
        self.assertEqual(self.req("/blocks", "POST",
                                  self.period(note="x" * 161))["status"], 400)
        self.assertEqual(self.req("/schedule?professional_id=" + self.pid +
                                  "&from=2026-02-31&to=2026-03-02")["status"], 400)
        self.assertEqual(self.req("/schedule?professional_id=other&from=" + self.day +
                                  "&to=" + self.day)["status"], 404)
        current = self.admin.request(self.base + "/catalog")["body"]
        s = next(s for s in current["services"] if s["id"] == self.first["id"])
        s["active"] = False
        self.assertEqual(self.req("/services/" + self.first["id"], "PUT", s)["status"], 200)
        self.req("/availability", "POST", self.period())
        self.assertEqual(self.slots()["body"]["slots"], [])
        future = (datetime.now(ZoneInfo("Europe/Lisbon")).date() +
                  timedelta(days=61)).isoformat()
        self.assertEqual(self.slots(self.follow["id"], date=future)["body"]["reason"],
                         "outside_booking_window")

    def test_photo_private_webp_and_preserved_when_editing_details(self):
        path = "/professionals/" + self.pid + "/photo"
        self.assertEqual(self.req(path)["status"], 404)
        bad = self.req(path, "PUT", {"photo": "data:image/jpeg;base64,Zg=="})
        self.assertEqual(bad["status"], 400)
        self.assertEqual(self.req(path, "PUT", {"photo": sample_photo()})["status"], 200)
        photo = self.req(path)
        self.assertEqual(photo["status"], 200)
        self.assertEqual(photo["headers"]["Content-Type"], "image/webp")
        self.assertEqual(photo["body"][:4], b"RIFF")
        professional = next(p for p in self.req("/catalog")["body"]["professionals"]
                            if p["id"] == self.pid)
        self.assertTrue(professional["has_photo"])
        self.assertIsNotNone(professional["photo_updated_at"])
        self.assertNotIn("photo_data", professional)
        professional["name"] = "Novo Nome"
        self.assertEqual(self.req("/professionals/" + self.pid, "PUT",
                                  professional)["status"], 200)
        self.assertEqual(self.req(path)["body"], photo["body"])
        self.assertEqual(self.req(path, "DELETE")["status"], 200)
        self.assertFalse(next(p for p in self.req("/catalog")["body"]["professionals"]
                              if p["id"] == self.pid)["has_photo"])

    def test_security_and_cross_org_writes(self):
        self.assertEqual(fixtures.Client().request(self.base + "/schedule")["status"], 401)
        self.assertEqual(fixtures.Client().request(self.base + "/slots-preview")["status"], 401)
        self.assertEqual(self.admin.request(self.base + "/availability", "POST",
                                            self.period(), csrf=False)["status"], 403)
        self.assertEqual(self.admin.request(self.base + "/blocks", "POST",
                                            self.period(), csrf=False)["status"], 403)
        self.assertEqual(self.admin.request(self.base + "/professionals/" + self.pid +
                                            "/photo", "PUT", {"photo":sample_photo()},
                                            csrf=False)["status"], 403)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.slots()["status"], 404)
            self.assertEqual(self.req("/professionals/" + self.pid + "/photo")["status"], 404)
            self.assertEqual(self.req("/availability", "POST", self.period())["status"], 404)
            self.assertEqual(self.admin.request("/admin-appointments-schedule.js")["status"], 404)
        with app.connect() as c:
            c.execute("INSERT INTO appt_organizations(id,name,timezone) VALUES(?,?,?)",
                      ("another-org", "Clínica B", "Europe/Lisbon"))
            ext_prof=catalogue.save_professional(c, {
                "name":"Outra pessoa","email":"other@clinic.test","active":True,
                "presencial_enabled":True,"online_enabled":True,"service_ids":[]
            },org_id="another-org")
            ext_period=availability.save_period(c,"availability",{
                "professional_id":ext_prof,"date":self.day,
                "start":"09:00","end":"10:00"
            },org_id="another-org")
        self.assertEqual(self.req("/availability", "POST",
                                  self.period()|{"professional_id":ext_prof})["status"], 404)
        self.assertEqual(self.req("/availability/"+ext_period,"DELETE")["status"], 404)
        self.assertEqual(self.req("/professionals/"+ext_prof+"/photo")["status"], 404)

    def test_dst_nonexistent_and_repeated_hours_fail_closed(self):
        with app.connect() as c:
            availability.save_period(c, "availability", {
                "professional_id":self.pid,"date":"2027-03-28",
                "start":"00:00","end":"04:00"})
            availability.save_period(c, "availability", {
                "professional_id":self.pid,"date":"2027-10-31",
                "start":"00:00","end":"04:00"})
            spring=availability.preview(c,catalogue.ORG_ID,self.pid,self.follow["id"],
                                        "online","2027-03-28",
                                        now=datetime(2027,3,27,12,tzinfo=timezone.utc))
            fall=availability.preview(c,catalogue.ORG_ID,self.pid,self.follow["id"],
                                      "online","2027-10-31",
                                      now=datetime(2027,10,30,12,tzinfo=timezone.utc))
            for result in (spring,fall):
                self.assertTrue(result["slots"])
                self.assertTrue(all(s["start"][:2] != "01" for s in result["slots"]))
                self.assertTrue(all(s["end"][:2] != "01" for s in result["slots"]))


if __name__ == "__main__":
    unittest.main()
