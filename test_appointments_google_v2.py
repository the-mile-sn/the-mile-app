"""Google Calendar integration — OAuth state, protected tokens and free/busy.

All tests use mocks. No real Google accounts, credentials or bookings modified.
"""
import base64
import json
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, urlencode
from unittest.mock import patch
from zoneinfo import ZoneInfo

import app
import test_app as fixtures
import appointments_google_v2 as google


KEY = base64.urlsafe_b64encode(b"G" * 32).decode("ascii")
TEST_ENV = {
    "MILE_GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
    "MILE_GOOGLE_CLIENT_SECRET": "test-secret",
    "MILE_GOOGLE_TOKEN_KEY": KEY,
    "MILE_GOOGLE_REDIRECT_URI": "https://admin.themile.pt" + google.CALLBACK_PATH,
}
BUSY = ("2026-11-18T10:00:00Z", "2026-11-18T11:00:00Z")


def fake_google(url, method="GET", payload=None, token=None):
    if url == google.GOOGLE_TOKEN:
        if payload["grant_type"] == "authorization_code":
            return {
                "scope": " ".join(google.SCOPES),
                "refresh_token": "secret-refresh-token-only-in-tests",
                "access_token": "one-time-token",
                "expires_in": 3600,
            }
        if payload["grant_type"] == "refresh_token":
            return {"access_token": "short-lived-test", "expires_in": 3600}
        raise AssertionError(payload)
    if url.startswith(google.GOOGLE_CALENDARS):
        return {"items": [
            {"id": "primary@example.test", "summary": "Pessoal", "primary": True,
             "accessRole": "owner"},
            {"id": "other@example.test", "summary": "Partilhado", "accessRole": "reader"},
        ]}
    if url == google.GOOGLE_FREEBUSY:
        result = {}
        for item in payload["items"]:
            result[item["id"]] = {"busy": [{"start": BUSY[0], "end": BUSY[1]}]}
        return {"calendars": result}
    raise AssertionError("Unexpected Google API call")


class GoogleCalendarConnectionTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.base = "/api/v2/admin/appointments"
        self.patched_env = patch.dict("os.environ", TEST_ENV)
        self.patched_env.start()
        self.addCleanup(self.patched_env.stop)
        self.http_patch = patch.object(google, "_request", side_effect=fake_google)
        self.mock_http = self.http_patch.start()
        self.addCleanup(self.http_patch.stop)
        with google._CACHE_LOCK:
            google._ACCESS_CACHE.clear()
        cat = self.admin.request(self.base+"/catalog")["body"]
        service = next(s for s in cat["services"] if s["duration_minutes"] == 90)
        self.sid = service["id"]
        created = self.admin.request(self.base + "/professionals", "POST", {
            "name":"Profissional Google",
            "email":"google@test.invalid","active":True,
            "presencial_enabled":True,"online_enabled":True,
            "service_ids":[service["id"]],
        })
        self.assertEqual(created["status"], 201, created)
        self.pid = created["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date()
                    + timedelta(days=2)).isoformat()
        avail = self.admin.request(self.base+"/availability","POST",{
            "professional_id":self.pid,"date":self.day,
            "start":"09:00","end":"13:00"})
        self.assertEqual(avail["status"],201,avail)

    def req(self, path, method="GET", data=None):
        return self.admin.request(self.base+"/google"+path,method,data)

    def link(self):
        before = self.req("/status?professional_id="+self.pid)
        self.assertTrue(before["body"]["configured"])
        self.assertFalse(before["body"]["connected"])
        start=self.req("/start","POST",{"professional_id":self.pid})
        self.assertEqual(start["status"],200,start)
        url=start["body"]["authorization_url"]
        self.assertEqual(urlparse(url).hostname,"accounts.google.com")
        args=parse_qs(urlparse(url).query)
        self.assertEqual(args["access_type"],["offline"])
        self.assertEqual(args["prompt"],["consent"])
        self.assertEqual(args["scope"][0].split(),list(google.SCOPES))
        state=args["state"][0]
        callback=self.req("/callback?state="+state+"&code=authorized-code")
        self.assertEqual(callback["status"],303,callback)
        self.assertEqual(callback["headers"]["Location"],
                         "/admin-appointments?google=connected#configuracao")
        self.assertEqual(self.req("/callback?state="+state+"&code=authorized-code")["status"],400)
        with app.connect() as c:
            db=c.execute("""SELECT refresh_secret FROM appt_google_connections
                WHERE org_id=? AND professional_id=?""",
                ("the-mile",self.pid)).fetchone()
        self.assertIsNotNone(db)
        self.assertNotIn("secret-refresh-token-only-in-tests", db["refresh_secret"])
        return state

    def test_state_bound_to_admin_and_single_use(self):
        self.assertEqual(self.req("/start","POST",{"professional_id":"not-an-id"})["status"],404)
        start=self.req("/start","POST",{"professional_id":self.pid})
        token=parse_qs(urlparse(start["body"]["authorization_url"]).query)["state"][0]
        guest=fixtures.Client().request(self.base+"/google/callback?state="+token+"&code=fake")
        self.assertEqual(guest["status"],401)
        invalid=self.req("/callback?state=not-valid&code=fake")
        self.assertEqual(invalid["status"],400,invalid)
        good=self.req("/callback?state="+token+"&code=fake")
        self.assertEqual(good["status"],303,good)
        self.assertEqual(self.req("/callback?state="+token+"&code=fake")["status"],400)

    def test_can_choose_busy_calendars_and_read_only_occupancy(self):
        self.link()
        calendars=self.req("/calendars?professional_id="+self.pid)
        self.assertEqual(calendars["status"],200,calendars)
        items=calendars["body"]["calendars"]
        self.assertEqual(len(items),2)
        self.assertTrue(items[0]["primary"])
        self.assertFalse(items[1]["can_write"])
        rejected=self.req("/settings","PUT",{
            "professional_id":self.pid,"target_calendar_id":"other@example.test",
            "busy_calendar_ids":["primary@example.test"]
        })
        self.assertEqual(rejected["status"],400,rejected)
        rejected=self.req("/settings","PUT",{
            "professional_id":self.pid,"target_calendar_id":"primary@example.test",
            "busy_calendar_ids":["unexpected@example.test"]
        })
        self.assertEqual(rejected["status"],400,rejected)
        selected=self.req("/settings","PUT",{
            "professional_id":self.pid,
            "target_calendar_id":"primary@example.test",
            "busy_calendar_ids":["primary@example.test","other@example.test"]
        })
        self.assertEqual(selected["status"],200,selected)
        self.assertTrue(selected["body"]["busy_check_active"])
        self.assertFalse(selected["body"]["event_sync_active"])
        self.assertEqual(selected["body"]["target_calendar_id"],"primary@example.test")
        with app.connect() as c:
            rows=c.execute("SELECT * FROM appt_google_selections WHERE professional_id=?",
                           (self.pid,)).fetchall()
        self.assertEqual(len(rows),2)
        with app.connect() as c:
            occupied=google.busy_intervals(c,"the-mile",self.pid,
                datetime(2026,11,18,tzinfo=timezone.utc),
                datetime(2026,11,19,tzinfo=timezone.utc))
        self.assertEqual(len(occupied),2)
        self.assertEqual(occupied[0][0],datetime(2026,11,18,10,tzinfo=timezone.utc))
        self.assertEqual(self.req("/disconnect","POST",{"professional_id":self.pid})["status"],200)
        self.assertFalse(self.req("/status?professional_id="+self.pid)["body"]["connected"])
        with app.connect() as c:
            self.assertEqual(google.busy_intervals(c,"the-mile",self.pid,
                datetime.now(timezone.utc),datetime.now(timezone.utc)+timedelta(days=1)),[])

    def test_freebusy_blocks_internal_reservations_and_previews(self):
        self.link()
        self.req("/settings","PUT",{
            "professional_id":self.pid,"target_calendar_id":"",
            "busy_calendar_ids":["primary@example.test"]
        })
        # The mocked provider reports BUSY on 18 November 2026.
        with app.connect() as c:
            avail=c.execute("SELECT id FROM appt_availability_periods WHERE professional_id=?",
                            (self.pid,)).fetchone()
            c.execute("DELETE FROM appt_availability_periods WHERE id=?", (avail["id"],))
            c.execute("""INSERT INTO appt_availability_periods
               (id,org_id,professional_id,day,start_minute,end_minute,created_at)
               VALUES(?,?,?,?,?,?,?)""",
               ("test-external-freebusy","the-mile",self.pid,"2026-11-18",540,780,1))
        # Predictable date-based behavior with a fake current time, no real Google IO.
        with app.connect() as c:
            from appointments_availability_v2 import month_preview
            m=month_preview(c,"the-mile",self.pid,self.sid,"presencial","2026-11",
                 now=datetime(2026,11,17,9,tzinfo=timezone.utc))
        day=next(x for x in m["days"] if x["date"]=="2026-11-18")
        self.assertTrue(m["includes_google"])
        self.assertEqual(day["slots_count"],3)
        self.assertTrue(day["available"])
        with app.connect() as c:
            from appointments_bookings_v2 import _validate_candidate
            blocked={
                "professional_id":self.pid,"service_id":self.sid,"mode":"presencial",
                "date":"2026-11-18","start":"09:00"
            }
            with self.assertRaisesRegex(ValueError,"google_busy"):
                _validate_candidate(c,"the-mile",blocked,
                    now=datetime(2026,11,17,9,tzinfo=timezone.utc))

    def test_google_outage_blocks_slots_instead_of_showing_false_availability(self):
        self.link()
        self.req("/settings","PUT",{
            "professional_id":self.pid,"target_calendar_id":"",
            "busy_calendar_ids":["primary@example.test"]
        })
        self.mock_http.side_effect=google.GoogleCalendarError("google_unavailable")
        path="/calendar-month?"+urlencode({
            "professional_id":self.pid,"service_id":self.sid,"mode":"presencial",
            "month":self.day[:7]})
        res=self.admin.request(self.base+path)
        self.assertEqual(res["status"],503,res)
        self.assertEqual(res["body"]["error"],"google_unavailable")
        booking=self.admin.request(self.base+"/bookings","POST",{
            "professional_id":self.pid,"service_id":self.sid,"mode":"presencial",
            "date":self.day,"start":"09:00","customer_name":"Test User"
        })
        self.assertEqual(booking["status"],503,booking)
        self.assertEqual(self.admin.request(self.base+"/bookings?from="+self.day+"&to="+self.day)
                         ["body"]["bookings"],[])

    def test_player_cannot_start_or_read_connections_and_csrf_is_required(self):
        self.assertEqual(fixtures.Client().request(
            self.base+"/google/status?professional_id="+self.pid)["status"],401)
        self.assertEqual(self.admin.request(self.base+"/google/start","POST",{
            "professional_id":self.pid},csrf=False)["status"],403)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.req("/status?professional_id="+self.pid)["status"],404)
            self.assertEqual(self.req("/start","POST",{"professional_id":self.pid})["status"],404)
            self.assertEqual(self.admin.request("/admin-appointments-google.js")["status"],404)

    def test_unconfigured_does_not_mutate_or_enable_any_link(self):
        with patch.dict("os.environ",{"MILE_GOOGLE_TOKEN_KEY":""}):
            status=self.req("/status?professional_id="+self.pid)
            self.assertEqual(status["status"],200,status)
            self.assertFalse(status["body"]["configured"])
            start=self.req("/start","POST",{"professional_id":self.pid})
            self.assertEqual(start["status"],503,start)
            self.assertEqual(start["body"]["error"],"google_not_configured")


if __name__=="__main__":
    unittest.main()
