"""Checkout pre-integration tests: 15-minute holds, no Shopify side effects."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo
from urllib.parse import urlencode

import app
import test_app as fixtures
import appointments_checkout_v2 as checkout
import appointments_availability_v2 as availability


class CheckoutHoldsTests(unittest.TestCase):
    def setUp(self):
        self.portal=fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin=self.portal.admin
        self.api="/api/v2/admin/appointments"
        cat=self.admin.request(self.api+"/catalog")["body"]
        self.first=next(s for s in cat["services"] if s["duration_minutes"]==90)
        self.follow=next(s for s in cat["services"] if s["duration_minutes"]==45)
        p=self.admin.request(self.api+"/professionals","POST",{
            "name":"Checkout Test Professional",
            "email":"checkout@ci.invalid","active":True,
            "presencial_enabled":True,"online_enabled":True,
            "service_ids":[self.first["id"],self.follow["id"]]
        })
        self.assertEqual(p["status"],201,p)
        self.pid=p["body"]["id"]
        self.day=(datetime.now(ZoneInfo("Europe/Lisbon")).date()+timedelta(days=2)).isoformat()
        avail=self.admin.request(self.api+"/availability","POST",{
            "professional_id":self.pid,"date":self.day,"start":"09:00","end":"13:00"
        })
        self.assertEqual(avail["status"],201,avail)

    def data(self,start="09:00",key="checkout-request-000001",mode="presencial",service=None):
        return {"professional_id":self.pid,"service_id":service or self.first["id"],
                "mode":mode,"date":self.day,"start":start,"idempotency_key":key}

    def month(self):
        return self.admin.request(self.api+"/calendar-month?"+urlencode({
            "professional_id":self.pid,"service_id":self.first["id"],
            "mode":"online","month":self.day[:7]}))

    def day_count(self):
        result=self.month()
        self.assertEqual(result["status"],200,result)
        return next(x["slots_count"] for x in result["body"]["days"] if x["date"]==self.day)

    def test_checkout_status_disabled_and_15_minute_expiry(self):
        status=self.admin.request(self.api+"/checkout/status")
        self.assertEqual(status["status"],200,status)
        self.assertFalse(status["body"]["public_booking_enabled"])
        self.assertFalse(status["body"]["shopify_checkout_connected"])
        self.assertEqual(status["body"]["hold_minutes"],15)
        self.assertEqual(self.day_count(),11)
        started=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual(started["status"],201,started)
        hold=started["body"]
        self.assertEqual(hold["remaining_seconds"],900)
        self.assertEqual(hold["status"],"held")
        self.assertFalse(hold["checkout_enabled"])
        self.assertEqual(hold["payment_status"],"not_connected")
        self.assertEqual(self.day_count(),5)
        summary=self.admin.request(self.api+"/checkout/status")["body"]
        self.assertEqual(summary["active_holds"],1)
        direct=self.admin.request(self.api+"/bookings","POST",{
            **self.data(),"customer_name":"Overlap Buyer"
        })
        self.assertEqual(direct["status"],409,direct)
        self.assertEqual(direct["body"]["error"],"checkout_hold_conflict")
        before=datetime.now(timezone.utc)
        future=before+timedelta(seconds=901)
        with app.connect() as c:
            self.assertFalse(checkout.active_conflict(
                c,"the-mile",self.pid,
                int(datetime.fromisoformat(self.day+"T09:00:00").replace(
                    tzinfo=ZoneInfo("Europe/Lisbon")).timestamp()),
                int(datetime.fromisoformat(self.day+"T10:30:00").replace(
                    tzinfo=ZoneInfo("Europe/Lisbon")).timestamp()),future))
            self.assertFalse(checkout.active_by_date(c,"the-mile",self.pid,
                self.day,self.day,future))
            row=c.execute("SELECT * FROM appt_checkout_holds WHERE id=?",(hold["id"],)).fetchone()
        self.assertEqual(checkout.public_status(row,int(future.timestamp()))["status"],"expired")
        with app.connect() as c:
            booked=checkout.start_hold(c,self.data(key="checkout-request-000002"),
                "test",now=future)
        self.assertNotEqual(hold["id"],booked["id"])
        self.assertEqual(booked["status"],"held")
        self.assertEqual(self.day_count(),5)

    def test_idempotency_and_release_are_safe(self):
        one=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        two=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual((one["status"],two["status"]),(201,201))
        self.assertEqual(one["body"]["id"],two["body"]["id"])
        self.assertEqual(one["body"]["expires_at"],two["body"]["expires_at"])
        mismatch=self.admin.request(self.api+"/checkout/holds","POST",self.data(start="09:15"))
        self.assertEqual(mismatch["status"],409,mismatch)
        held=self.admin.request(self.api+"/checkout/holds","POST",
            self.data(start="09:15",key="checkout-request-000003",mode="online"))
        self.assertEqual(held["status"],409,held)
        released=self.admin.request(
            self.api+"/checkout/holds/"+one["body"]["id"]+"/release","POST",{})
        self.assertEqual(released["status"],200,released)
        self.assertEqual(released["body"]["status"],"released")
        self.assertEqual(self.day_count(),11)
        existing=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual(existing["status"],409,existing)
        self.assertEqual(existing["body"]["error"],"checkout_hold_closed")
        new=self.admin.request(self.api+"/checkout/holds","POST",
            self.data(start="09:00",key="checkout-request-000004"))
        self.assertEqual(new["status"],201,new)

    def test_other_hours_and_formats_share_professional_capacity(self):
        a=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual(a["status"],201,a)
        adjacent=self.admin.request(self.api+"/checkout/holds","POST",
            self.data(start="10:30",key="checkout-request-000005",
                      service=self.follow["id"],mode="online"))
        self.assertEqual(adjacent["status"],201,adjacent)
        overlap=self.admin.request(self.api+"/checkout/holds","POST",
            self.data(start="09:45",key="checkout-request-000006",
                      service=self.follow["id"],mode="online"))
        self.assertEqual(overlap["status"],409,overlap)
        self.assertEqual(overlap["body"]["error"],"checkout_hold_conflict")
        with app.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM appt_checkout_holds"
                " WHERE status='held'") .fetchone()["n"],2)

    def test_manual_booking_before_hold_wins(self):
        created=self.admin.request(self.api+"/bookings","POST",{
            **self.data(),"customer_name":"Cliente Primeiro"
        })
        self.assertEqual(created["status"],201,created)
        hold=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual(hold["status"],409,hold)
        self.assertEqual(hold["body"]["error"],"booking_overlap")
        self.assertEqual(self.admin.request(self.api+"/checkout/status")["body"]["active_holds"],0)

    def test_invalid_variant_cannot_be_held(self):
        with app.connect() as c:
            c.execute("""UPDATE appt_service_formats SET shopify_variant_id=NULL
                WHERE org_id=? AND service_id=? AND mode=?""",
                ("the-mile",self.first["id"],"presencial"))
        bad=self.admin.request(self.api+"/checkout/holds","POST",self.data())
        self.assertEqual(bad["status"],400,bad)
        self.assertEqual(bad["body"]["error"],"checkout_variant_missing")

    def test_admin_only_no_public_or_player_api(self):
        base=self.api+"/checkout"
        self.assertEqual(fixtures.Client().request(base+"/status")["status"],401)
        self.assertEqual(fixtures.Client().request(base+"/holds","POST",self.data())["status"],401)
        self.assertEqual(self.admin.request(base+"/holds","POST",self.data(),csrf=False)["status"],403)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.admin.request(base+"/status")["status"],404)
            self.assertEqual(self.admin.request(base+"/holds","POST",self.data())["status"],404)


if __name__=="__main__":
    unittest.main()
