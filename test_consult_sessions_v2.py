"""Consultas: listas, ficha e registo de cada consulta (Nota e Fecho)."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import app
import test_app as fixtures


class ConsultSessionsTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.appt = "/api/v2/admin/appointments"
        self.base = "/api/v2/admin/consultations"
        cat = self.admin.request(self.appt + "/catalog")["body"]
        self.service = next(s for s in cat["services"] if s["duration_minutes"] == 45)
        prof = self.admin.request(self.appt + "/professionals", "POST", {
            "name": "Prof Sessões", "email": "prof-sessoes@test.invalid", "active": True,
            "presencial_enabled": True, "online_enabled": True, "service_ids": [self.service["id"]]})
        self.pid = prof["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date() + timedelta(days=2)).isoformat()
        self.admin.request(self.appt + "/availability", "POST", {
            "professional_id": self.pid, "date": self.day, "start": "09:00", "end": "13:00"})
        r = self.admin.request(self.appt + "/bookings", "POST", {
            "professional_id": self.pid, "service_id": self.service["id"], "mode": "online",
            "date": self.day, "start": "09:00", "customer_name": "Rita Sousa",
            "customer_email": "rita@example.pt"})
        self.booking = r["body"]["id"]

    def req(self, suffix="", method="GET", payload=None, **kw):
        return self.admin.request(self.base + suffix, method, payload, **kw)

    def test_workspace_start_save_and_close(self):
        ws = self.req()
        self.assertEqual(ws["status"], 200, ws)
        upcoming = ws["body"]["upcoming"]
        self.assertEqual([x["client_name"] for x in upcoming], ["Rita Sousa"])
        item = upcoming[0]
        self.assertIsNone(item["session_id"])
        started = self.req(f"/bookings/manual/{self.booking}/start", "POST", {})
        self.assertEqual(started["status"], 200, started)
        session = started["body"]["session"]
        self.assertEqual(session["status"], "open")
        again = self.req(f"/bookings/manual/{self.booking}/start", "POST", {})
        self.assertEqual(again["body"]["session"]["id"], session["id"])
        sid, version = session["id"], session["version"]
        bad = [{"version": version, "indicators": {"sleep": 6}},
               {"version": version, "indicators": {"mood": 3}},
               {"version": version, "objectives": ["x"] * 11},
               {"version": version, "next_weeks": 0},
               {"version": version, "next_action": "call"}]
        for payload in bad:
            self.assertEqual(self.req(f"/sessions/{sid}", "PUT", payload)["status"], 400, payload)
        ok = self.req(f"/sessions/{sid}", "PUT", {"version": version, "note_text": "Correu bem.",
                                                   "indicators": {"sleep": 4, "energy": 3},
                                                   "objectives": ["Lanche pré-treino", ""],
                                                   "next_weeks": 4, "next_action": "link"})
        self.assertEqual(ok["status"], 200, ok)
        self.assertEqual(self.req(f"/sessions/{sid}", "PUT", {"version": version, "note_text": "x"})["status"], 409)
        version = ok["body"]["version"]
        view = self.req(f"/bookings/manual/{self.booking}")["body"]["session"]
        self.assertEqual(view["indicators"], {"energy": 3, "sleep": 4})
        self.assertEqual(view["objectives"], ["Lanche pré-treino"])
        closed = self.req(f"/sessions/{sid}/close", "POST", {"version": version})
        self.assertEqual(closed["status"], 200, closed)
        self.assertEqual(self.req(f"/sessions/{sid}", "PUT", {"version": closed["body"]["version"], "note_text": "x"})["status"], 409)
        self.assertEqual(self.req(f"/sessions/{sid}/close", "POST", {"version": closed["body"]["version"]})["status"], 409)
        client_id = item["client_id"]
        detail = self.req(f"/clients/{client_id}")
        self.assertEqual(detail["status"], 200, detail)
        self.assertEqual(detail["body"]["closed"], 1)
        self.assertEqual(detail["body"]["history"][0]["note_text"], "Correu bem.")
        self.assertIsNone(detail["body"]["next"])

    def test_assessment_saves_and_calculates_on_server(self):
        ws = self.req()
        client_id = ws["body"]["upcoming"][0]["client_id"]
        prof = self.admin.request("/api/v2/admin/consult-clients/" + client_id)["body"]
        self.admin.request("/api/v2/admin/consult-clients/" + client_id, "PUT",
                           {"version": prof["version"], "sex": "F", "birth_date": "1992-05-10", "height_cm": 165})
        sid = self.req(f"/bookings/manual/{self.booking}/start", "POST", {})["body"]["session"]["id"]
        measures = {"weight_kg": 63, "subscapular": 12, "triceps": 16, "biceps": 6, "suprailiac": 14,
                    "supraspinal": 9, "abdominal": 18, "thigh": 22, "calf": 11,
                    "arm_relaxed": 27, "thigh_mid": 54, "calf_girth": 34.5}
        self.assertEqual(self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": {"weight_kg": 2}})["status"], 400)
        self.assertEqual(self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": measures, "equation": "nope"})["status"], 400)
        first = self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": measures})
        self.assertEqual(first["status"], 200, first)
        a = first["body"]["assessment"]
        self.assertEqual(a["measures"]["height_cm"], 165)  # vem do perfil
        self.assertEqual(a["results"]["equation"], "peterson")
        self.assertIsNotNone(a["results"]["fat_pct"])
        self.assertIsNotNone(a["results"]["muscle_kg"])
        stale = self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": measures, "version": 99})
        self.assertEqual(stale["status"], 409)
        again = self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": measures, "equation": "durnin", "version": a["version"]})
        self.assertEqual(again["body"]["assessment"]["results"]["equation"], "durnin")
        view = self.req(f"/bookings/manual/{self.booking}")["body"]
        self.assertEqual(view["assessment"]["equation"], "durnin")
        self.assertIn("peterson", [e["key"] for e in view["equations"]])
        self.assertNotIn("media4", [e["key"] for e in view["equations"]])  # só homens
        trend = self.req(f"/clients/{client_id}")["body"]["assessments"]
        self.assertEqual(trend[0]["weight_kg"], 63)
        version = self.req(f"/bookings/manual/{self.booking}")["body"]["session"]["version"]
        self.req(f"/sessions/{sid}/close", "POST", {"version": version})
        closed = self.req(f"/sessions/{sid}/assessment", "PUT", {"measures": measures, "version": again["body"]["assessment"]["version"]})
        self.assertEqual(closed["status"], 409)

    def test_open_session_can_be_discarded(self):
        self.req()
        started = self.req(f"/bookings/manual/{self.booking}/start", "POST", {})["body"]["session"]
        self.req(f"/sessions/{started['id']}/assessment", "PUT", {"measures": {"weight_kg": 70}})
        gone = self.req(f"/sessions/{started['id']}", "DELETE")
        self.assertEqual(gone["status"], 200, gone)
        ws = self.req()["body"]
        self.assertIsNone(ws["upcoming"][0]["session_id"])
        self.assertEqual(self.req(f"/sessions/{started['id']}", "DELETE")["status"], 404)
        again = self.req(f"/bookings/manual/{self.booking}/start", "POST", {})["body"]["session"]
        self.assertIsNone(self.req(f"/bookings/manual/{self.booking}")["body"]["assessment"])
        self.req(f"/sessions/{again['id']}/close", "POST", {"version": again["version"]})
        self.assertEqual(self.req(f"/sessions/{again['id']}", "DELETE")["status"], 409)

    def test_unknown_booking_and_access(self):
        self.req()  # liga a marcação ao perfil
        self.assertEqual(self.req("/bookings/manual/" + "0" * 32 + "/start", "POST", {})["status"], 404)
        self.assertEqual(self.req("/bookings/other/x/start", "POST", {})["status"], 400)
        self.assertEqual(fixtures.Client().request(self.base)["status"], 401)
        self.assertEqual(self.req(f"/bookings/manual/{self.booking}/start", "POST", {}, csrf=False)["status"], 403)
        with patch.object(app, "SITE_ROLE", "player"):
            self.assertEqual(self.req()["status"], 404)
            self.assertEqual(self.admin.request("/admin-consultas")["status"], 404)


if __name__ == "__main__":
    unittest.main()
