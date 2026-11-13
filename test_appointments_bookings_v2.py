"""Phase 4.1: private manual bookings, overlaps, versioning and audit."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import app
import test_app as fixtures
import appointments_bookings_v2 as bookings


class ManualBookingsTests(unittest.TestCase):
    def setUp(self):
        self.portal=fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin=self.portal.admin
        self.base="/api/v2/admin/appointments"
        cat=self.req("/catalog")["body"]
        self.first=next(s for s in cat["services"] if s["duration_minutes"]==90)
        self.follow=next(s for s in cat["services"] if s["duration_minutes"]==45)
        data={"name":"Profissional Teste","email":"prof-booking@test.invalid",
              "active":True,"presencial_enabled":True,"online_enabled":True,
              "service_ids":[self.first["id"],self.follow["id"]]}
        response=self.req("/professionals","POST",data)
        self.assertEqual(response["status"],201,response)
        self.pid=response["body"]["id"]
        self.day=(datetime.now(ZoneInfo("Europe/Lisbon")).date()+timedelta(days=2)).isoformat()
        self.req("/availability","POST",{
            "professional_id":self.pid,"date":self.day,"start":"09:00","end":"13:00"})

    def req(self,suffix,method="GET",payload=None):
        return self.admin.request(self.base+suffix,method,payload)

    def payload(self,start="09:00",service=None,mode="presencial",**kwargs):
        return {"professional_id":self.pid,"service_id":service or self.first["id"],
                "mode":mode,"date":self.day,"start":start,
                "customer_name":"Cliente de Teste",
                "customer_email":"cliente@example.pt","customer_phone":"+351 912 345 678",
                **kwargs}

    def query(self,**filters):
        from urllib.parse import urlencode
        params={"from":self.day,"to":self.day,**filters}
        return self.req("/bookings?"+urlencode(params))

    def book(self,**kwargs):
        return self.req("/bookings","POST",self.payload(**kwargs))

    def test_crud_overlap_adjacent_and_payment_is_not_faked(self):
        a=self.book()
        self.assertEqual(a["status"],201,a)
        identifier=a["body"]["id"]
        duplicate=self.book(start="09:15",service=self.follow["id"],mode="online")
        self.assertEqual(duplicate["status"],409,duplicate)
        self.assertEqual(duplicate["body"]["error"],"booking_overlap")
        adjacent=self.book(start="10:30",service=self.follow["id"],mode="online")
        self.assertEqual(adjacent["status"],201,adjacent)
        listed=self.query()
        self.assertEqual(listed["status"],200,listed)
        items=listed["body"]["bookings"]
        self.assertEqual(len(items),2)
        self.assertEqual(items[0]["id"],identifier)
        self.assertEqual((items[0]["start"],items[0]["end"]),("09:00","10:30"))
        self.assertEqual(items[0]["status"],"scheduled")
        self.assertEqual(items[0]["source"],"manual")
        self.assertEqual(items[0]["payment_status"],"not_linked")
        self.assertIsNone(items[0]["shopify_order_id"])
        self.assertIsNone(items[0]["google_event_id"])
        self.assertTrue(listed["body"]["internal_only"])
        self.assertFalse(listed["body"]["integrations"]["sesami"])
        self.assertFalse(listed["body"]["integrations"]["google"])
        self.assertEqual(len(self.query(status="cancelled")["body"]["bookings"]),0)
        self.assertEqual(len(self.query(status="scheduled")["body"]["bookings"]),2)
        with app.connect() as c:
            actions=c.execute("SELECT action FROM appt_booking_history WHERE booking_id=?",
                              (identifier,)).fetchall()
        self.assertEqual([x["action"] for x in actions],["created"])

    def test_preview_subtracts_internal_bookings_and_cancel_reopens(self):
        before=self.req("/slots-preview?professional_id="+self.pid+
                        "&service_id="+self.first["id"]+"&mode=online&date="+self.day)
        self.assertEqual(len(before["body"]["slots"]),11)
        created=self.book()
        self.assertEqual(created["status"],201)
        after=self.req("/slots-preview?professional_id="+self.pid+
                       "&service_id="+self.first["id"]+"&mode=online&date="+self.day)
        self.assertTrue(after["body"]["includes_bookings"])
        self.assertFalse(after["body"]["includes_sesami"])
        self.assertEqual([s["start"] for s in after["body"]["slots"]],
                         ["10:30","10:45","11:00","11:15","11:30"])
        identifier=created["body"]["id"]
        item=self.query()["body"]["bookings"][0]
        stale=self.req("/bookings/"+identifier+"/cancel","POST",{"version":999})
        self.assertEqual(stale["status"],409)
        cancellation=self.req("/bookings/"+identifier+"/cancel","POST",{"version":item["version"]})
        self.assertEqual(cancellation["status"],200,cancellation)
        self.assertEqual(self.query()["body"]["bookings"][0]["status"],"cancelled")
        self.assertEqual(len(self.req("/slots-preview?professional_id="+self.pid+
                        "&service_id="+self.first["id"]+"&mode=online&date="+self.day)["body"]["slots"]),11)
        self.assertEqual(self.req("/bookings/"+identifier+"/cancel","POST",
                                  {"version":item["version"]})["status"],409)
        with app.connect() as c:
            history=c.execute("SELECT action FROM appt_booking_history WHERE booking_id=? ORDER BY created_at,id",
                              (identifier,)).fetchall()
        self.assertEqual(set(x["action"] for x in history),{"created","cancelled"})

    def test_rescheduling_updates_duration_professional_and_prevents_stale_writes(self):
        first=self.book()
        self.assertEqual(first["status"],201)
        identifier=first["body"]["id"]
        data=self.query()["body"]["bookings"][0]
        change=self.payload(start="11:00",service=self.follow["id"],mode="online")
        change["version"]=data["version"]
        result=self.req("/bookings/"+identifier,"PUT",change)
        self.assertEqual(result["status"],200,result)
        new=self.query()["body"]["bookings"][0]
        self.assertEqual((new["start"],new["end"]),("11:00","11:45"))
        self.assertEqual(new["mode"],"online")
        self.assertEqual(new["version"],2)
        self.assertEqual(self.req("/bookings/"+identifier,"PUT",change)["status"],409)
        other=self.req("/professionals","POST",{
            "name":"Segunda Profissional","email":"segunda@test.invalid","active":True,
            "presencial_enabled":True,"online_enabled":True,
            "service_ids":[self.first["id"],self.follow["id"]]})
        self.assertEqual(other["status"],201)
        second_id=other["body"]["id"]
        self.req("/availability","POST",{"professional_id":second_id,"date":self.day,
                                         "start":"09:00","end":"13:00"})
        change={"professional_id":second_id,**self.payload(start="09:00")}
        change["version"]=new["version"]
        result=self.req("/bookings/"+identifier,"PUT",change)
        self.assertEqual(result["status"],200,result)
        moved=self.query()["body"]["bookings"][0]
        self.assertEqual(moved["professional_id"],second_id)
        self.assertEqual(moved["version"],3)
        self.assertEqual(len(self.query(professional_id=self.pid)["body"]["bookings"]),0)
        self.assertEqual(len(self.query(professional_id=second_id)["body"]["bookings"]),1)

    def test_blocked_without_availability_and_nonquarter_are_rejected(self):
        self.assertEqual(self.book(start="09:05")["status"],400)
        self.assertEqual(self.book(start="12:30")["status"],400) # 90 min exceeds window
        self.req("/blocks","POST",{"professional_id":self.pid,"date":self.day,
                                   "start":"10:00","end":"11:00","note":"Privado"})
        blocked=self.book(start="09:00")
        self.assertEqual(blocked["status"],400)
        self.assertEqual(blocked["body"]["error"],"blocked_period")
        self.assertEqual(self.book(start="11:30")["status"],201)
        self.assertEqual(self.query(status="all")["body"]["bookings"][0]["customer_name"],
                         "Cliente de Teste")

    def test_authorization_and_org_boundary(self):
        self.assertEqual(fixtures.Client().request(self.base+"/bookings")["status"],401)
        self.assertEqual(fixtures.Client().request(self.base+"/bookings","POST",self.payload())["status"],401)
        self.assertEqual(self.admin.request(self.base+"/bookings","POST",self.payload(),csrf=False)["status"],403)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.req("/bookings?from="+self.day+"&to="+self.day)["status"],404)
            self.assertEqual(self.req("/bookings","POST",self.payload())["status"],404)
            self.assertEqual(self.req("/admin-appointments-bookings.js")["status"],404)
        with app.connect() as c:
            c.execute("INSERT INTO appt_organizations(id,name,timezone) VALUES(?,?,?)",
                      ("another-clinic","Test Clinic","Europe/Lisbon"))
            import appointments_catalog_v2 as catalogue
            outsider=catalogue.save_professional(c,{
                "name":"Externo","email":"external@clinic.test","active":True,
                "presencial_enabled":True,"online_enabled":True,"service_ids":[]
            },org_id="another-clinic")
        self.assertIn(self.req("/bookings","POST",
                    self.payload(professional_id=outsider))["status"],(400,404))
        self.assertEqual(len(self.query()["body"]["bookings"]),0)

    def test_manual_source_and_payment_cannot_be_spoofed(self):
        payload=self.payload()
        payload.update({"source":"shopify","status":"paid","payment_status":"paid",
                        "shopify_order_id":"999","google_event_id":"external"})
        result=self.req("/bookings","POST",payload)
        self.assertEqual(result["status"],201,result)
        stored=self.query()["body"]["bookings"][0]
        self.assertEqual(stored["status"],"scheduled")
        self.assertEqual(stored["source"],"manual")
        self.assertEqual(stored["payment_status"],"not_linked")
        self.assertIsNone(stored["shopify_order_id"])
        self.assertIsNone(stored["google_event_id"])


if __name__=="__main__":
    unittest.main()
