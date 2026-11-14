"""Adjustable booking rules: secure writes, public slots and checkout TTL."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import app
import test_app as fixtures


class BookingRulesTests(unittest.TestCase):
    def setUp(self):
        self.portal=fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin=self.portal.admin
        self.guest=fixtures.Client()
        self.base="/api/v2/admin/appointments"
        self.public="/api/v2/public/appointments"
        self.preview=patch.dict("os.environ",{"MILE_BOOKING_PREVIEW_ENABLED":"1"})
        self.preview.start()
        self.addCleanup(self.preview.stop)
        catalogue=self.admin.request(self.base+"/catalog")["body"]
        self.service=next(item for item in catalogue["services"]
                          if item["duration_minutes"]==90)
        professional=self.admin.request(self.base+"/professionals","POST",{
            "name":"Test Rule Professional",
            "email":"rules-test@invalid.example",
            "active":True,
            "presencial_enabled":True,
            "online_enabled":True,
            "service_ids":[self.service["id"]],
        })
        self.assertEqual(professional["status"],201,professional)
        self.pid=professional["body"]["id"]
        self.day=(datetime.now(ZoneInfo("Europe/Lisbon")).date()+
                  timedelta(days=2)).isoformat()
        period=self.admin.request(self.base+"/availability","POST",{
            "professional_id":self.pid,"date":self.day,
            "start":"09:00","end":"13:00"
        })
        self.assertEqual(period["status"],201,period)

    def payload(self,version=0,start=10,hold=20):
        return {"start_interval_minutes":start,"checkout_hold_minutes":hold,
                "version":version}

    def day_slots(self,public=False):
        suffix="/slots" if public else "/slots-preview"
        params=urlencode({"professional_id":self.pid,
                          "service_id":self.service["id"],
                          "mode":"presencial","date":self.day})
        url=(self.public if public else self.base)+suffix+"?"+params
        return (self.guest if public else self.admin).request(url)

    def new_hold(self,start,key):
        return self.admin.request(self.base+"/checkout/holds","POST",{
            "professional_id":self.pid,"service_id":self.service["id"],
            "mode":"presencial","date":self.day,"start":start,
            "idempotency_key":key
        })

    def test_save_updates_public_slots_and_checkout_holds_without_restarting(self):
        default=self.admin.request(self.base+"/rules")
        self.assertEqual(default["status"],200,default)
        self.assertEqual(default["body"]["start_interval_minutes"],15)
        self.assertEqual(default["body"]["checkout_hold_minutes"],15)
        self.assertEqual(default["body"]["version"],0)
        self.assertEqual(self.day_slots()["body"]["slots"][1]["start"],"09:15")
        old=self.new_hold("09:00","booking-rules-hold-old-001")
        self.assertEqual(old["status"],201,old)
        self.assertEqual(old["body"]["remaining_seconds"],900)

        save=self.admin.request(self.base+"/rules","PUT",self.payload())
        self.assertEqual(save["status"],200,save)
        self.assertEqual(save["body"]["version"],1)
        self.assertEqual(save["body"]["start_interval_minutes"],10)
        self.assertEqual(save["body"]["checkout_hold_minutes"],20)

        public_catalog=self.guest.request(self.public+"/catalog")
        self.assertEqual(public_catalog["status"],200,public_catalog)
        self.assertEqual(public_catalog["body"]["interval_minutes"],10)
        self.assertEqual(public_catalog["body"]["checkout_hold_minutes"],20)
        days=self.day_slots(public=True)
        self.assertEqual(days["status"],200,days)
        self.assertIn("10:40",[s["start"] for s in days["body"]["slots"]])
        self.assertNotIn("10:45",[s["start"] for s in days["body"]["slots"]])
        self.assertEqual(self.day_slots()["body"]["interval_minutes"],10)
        new=self.new_hold("11:00","booking-rules-hold-new-001")
        self.assertEqual(new["status"],201,new)
        self.assertEqual(new["body"]["remaining_seconds"],1200)

        # Existing holds are never silently shortened or extended by a save.
        with app.connect() as c:
            first=c.execute("SELECT expires_at,created_at FROM appt_checkout_holds WHERE id=?",
                            (old["body"]["id"],)).fetchone()
            second=c.execute("SELECT expires_at,created_at FROM appt_checkout_holds WHERE id=?",
                             (new["body"]["id"],)).fetchone()
        self.assertEqual(first["expires_at"]-first["created_at"],900)
        self.assertEqual(second["expires_at"]-second["created_at"],1200)

        bad=self.admin.request(self.base+"/bookings","POST",{
            "professional_id":self.pid,"service_id":self.service["id"],
            "mode":"presencial","date":self.day,"start":"11:15",
            "customer_name":"Wrong minute"
        })
        self.assertEqual(bad["status"],400,bad)
        self.assertEqual(bad["body"]["error"],"start_not_on_interval")

    def test_rule_write_requires_admin_and_valid_version(self):
        path=self.base+"/rules"
        self.assertEqual(self.guest.request(path)["status"],401)
        self.assertEqual(self.guest.request(path,"PUT",self.payload())["status"],401)
        self.assertEqual(self.admin.request(path,"POST",{})["status"],404)
        for payload in (
            self.payload(start=7),
            self.payload(hold=120),
            self.payload(start=True),
            self.payload(hold="15"),
            {"start_interval_minutes":10,"checkout_hold_minutes":20},
            {**self.payload(),"secret":"oops"},
        ):
            response=self.admin.request(path,"PUT",payload)
            self.assertEqual(response["status"],400,response)
            self.assertEqual(response["body"]["error"],"invalid_booking_rules")
        first=self.admin.request(path,"PUT",self.payload())
        self.assertEqual(first["status"],200,first)
        collision=self.admin.request(path,"PUT",self.payload())
        self.assertEqual(collision["status"],409,collision)
        self.assertEqual(collision["body"]["error"],"stale_booking_rules")
        self.assertEqual(self.admin.request(path)["body"]["version"],1)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.admin.request(path)["status"],404)


if __name__=="__main__":
    unittest.main()
