"""Shopify bridge: no calls to real Shopify, no orders or payments created."""
import base64
import hashlib
import hmac
import io
import json
import time
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from unittest.mock import patch
from zoneinfo import ZoneInfo

import app
import test_app as fixtures
import appointments_shopify_bridge_v2 as bridge

SECRET = "the-mile-staging-test-secret-do-not-use-live-2026"
SHOP = "the-mile-sports-nutrition.myshopify.com"
CONFIG = {
    "MILE_SHOPIFY_APP_SECRET": SECRET,
    "MILE_SHOPIFY_SHOP_DOMAIN": SHOP,
    "MILE_SHOPIFY_WEBHOOK_ENABLED": "1",
    "MILE_SHOPIFY_CHECKOUT_ENABLED": "1",
    "MILE_SHOPIFY_SESAMI_MIGRATED": "1",
}


class ShopifyPaymentBridgeTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin = self.portal.admin
        self.env = patch.dict("os.environ", CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)
        cat = self.admin.request("/api/v2/admin/appointments/catalog")["body"]
        self.service = next(s for s in cat["services"] if s["duration_minutes"] == 90)
        response = self.admin.request("/api/v2/admin/appointments/professionals","POST",{
            "name":"Shopify Paid Webhook Test",
            "email":"test-shopify@invalid.test",
            "active":True,"presencial_enabled":True,
            "online_enabled":True,"service_ids":[self.service["id"]],
        })
        self.assertEqual(response["status"], 201, response)
        self.pid = response["body"]["id"]
        self.day = (datetime.now(ZoneInfo("Europe/Lisbon")).date()+
                    timedelta(days=2)).isoformat()
        response = self.admin.request("/api/v2/admin/appointments/availability","POST",{
            "professional_id":self.pid,"date":self.day,"start":"09:00","end":"13:00",
        })
        self.assertEqual(response["status"],201,response)

    def payload(self, key="shopify-test-idempotency-0001"):
        return {"professional_id":self.pid,"service_id":self.service["id"],
                "mode":"presencial","date":self.day,"start":"09:00",
                "idempotency_key":key}

    def signed_proxy(self, **updates):
        query = {
            "shop":SHOP,"path_prefix":"/apps/the-mile-booking",
            "timestamp":str(int(time.time())),"logged_in_customer_id":"",
        }
        query.update(updates)
        material="".join(sorted(k+"="+str(v) for k,v in query.items())).encode()
        query["signature"]=hmac.new(SECRET.encode(),material,hashlib.sha256).hexdigest()
        return urlencode(query)

    def start(self):
        with app.connect() as c:
            return bridge.create_checkout_hold(c,self.signed_proxy(),self.payload())

    def order(self, cart, identifier=9001234567001):
        return {
            "id":identifier,"financial_status":"paid","currency":"EUR",
            "email":"cliente.pago@example.pt",
            "customer":{"first_name":"Pessoa","last_name":"Pagou"},
            "line_items":[{
                "variant_id":cart["variant_id"],"quantity":1,
                "price":f"{self.service['formats']['presencial']['price_cents']/100:.2f}",
                "properties":[
                    {"name":name,"value":value}
                    for name,value in cart["properties"].items()
                ],
            }],
        }

    def webhook(self, data, delivery="763d07ba-1a15-3b11-950e-2437cd210019",
                topic="orders/paid",shop=SHOP,tamper=False):
        body=json.dumps(data,separators=(",",":")).encode()
        signature=base64.b64encode(hmac.new(SECRET.encode(),body,hashlib.sha256).digest()).decode()
        if tamper:
            signature=base64.b64encode(b"x"*32).decode()
        env={
            "REQUEST_METHOD":"POST",
            "PATH_INFO":{"orders/paid":"/api/v2/shopify/webhooks/orders-paid",
                         "orders/cancelled":"/api/v2/shopify/webhooks/orders-cancelled",
                         "refunds/create":"/api/v2/shopify/webhooks/refunds-create"
                         }.get(topic,"/api/v2/shopify/webhooks/orders-paid"),
            "QUERY_STRING":"","wsgi.input":io.BytesIO(body),
            "CONTENT_LENGTH":str(len(body)),
            "HTTP_X_SHOPIFY_HMAC_SHA256":signature,
            "HTTP_X_SHOPIFY_WEBHOOK_ID":delivery,
            "HTTP_X_SHOPIFY_SHOP_DOMAIN":shop,
            "HTTP_X_SHOPIFY_TOPIC":topic,
            "REMOTE_ADDR":"127.0.0.1",
        }
        result={}
        def start(status, headers):
            result["status"]=int(status.split()[0])
            result["headers"]=dict(headers)
        output=b"".join(app.application(env,start))
        result["body"]=json.loads(output)
        return result

    def test_cart_line_shows_visible_booking_details_after_private_markers(self):
        with app.connect() as c:
            line=bridge.create_checkout_hold(c,self.signed_proxy(),self.payload("visible-details-key-0001"))
        props=line["properties"]
        # Private markers stay first, so existing order parsing is unchanged.
        self.assertEqual(list(props)[:2],["_the_mile_hold","_the_mile_proof"])
        self.assertEqual(props["Hora"],"09:00 – 10:30")
        self.assertEqual(props["Formato"],"Presencial")
        self.assertEqual(props["Nutricionista"],"Shopify Paid Webhook Test")
        day=datetime.fromisoformat(self.day)
        self.assertIn("%d de " % day.day, props["Data"])
        self.assertTrue(props["Data"].endswith(str(day.year)))
        # Visible details are display only and never affect confirmation.
        details=bridge.visible_booking_details(
            {"day":"2026-11-27","start_minute":600,"end_minute":690,"mode":"online"})
        self.assertEqual(details,{"Data":"sexta-feira, 27 de novembro de 2026",
                                  "Hora":"10:00 – 11:30","Formato":"Online"})

    def test_checkout_proxy_signed_request_and_idempotent_hold(self):
        with app.connect() as c:
            first=bridge.create_checkout_hold(c,self.signed_proxy(),self.payload())
        self.assertEqual(first["quantity"],1)
        self.assertEqual(first["professional_id"],self.pid)
        self.assertRegex(first["properties"]["_the_mile_hold"],r"^[0-9a-f]{32}$")
        self.assertEqual(len(first["properties"]["_the_mile_proof"]),64)
        with app.connect() as c:
            retry=bridge.create_checkout_hold(c,self.signed_proxy(),self.payload())
        self.assertEqual(retry["hold_id"],first["hold_id"])
        for changes in (
            {"shop":"another-store.myshopify.com"},
            {"timestamp":str(int(time.time())-700)},
            {"path_prefix":"/apps/other"},
        ):
            with self.assertRaises(bridge.ShopifyBridgeError):
                bridge.verify_proxy(self.signed_proxy(**changes))
        with self.assertRaises(bridge.ShopifyBridgeError):
            bridge.verify_proxy(self.signed_proxy()+"&service_id=forged")
        with patch.dict("os.environ",{"MILE_SHOPIFY_SESAMI_MIGRATED":"0"}):
            with self.assertRaisesRegex(bridge.ShopifyBridgeError,"shopify_checkout_disabled"):
                bridge.verify_proxy(self.signed_proxy())

    def test_proxy_http_endpoint_is_signed_and_disabled_until_migration(self):
        request_body=json.dumps(self.payload()).encode()
        def request(query):
            env={
                "REQUEST_METHOD":"POST",
                "PATH_INFO":"/api/v2/shopify/app-proxy/hold",
                "QUERY_STRING":query,
                "wsgi.input":io.BytesIO(request_body),
                "CONTENT_LENGTH":str(len(request_body)),
                "REMOTE_ADDR":"127.0.0.1",
                "HTTP_ORIGIN":"https://www.themile.pt",
            }
            answer={}
            def start(status,headers):
                answer["status"]=int(status.split()[0])
                answer["headers"]=dict(headers)
            answer["body"]=json.loads(b"".join(app.application(env,start)))
            return answer
        valid=request(self.signed_proxy())
        self.assertEqual(valid["status"],201,valid)
        self.assertEqual(valid["body"]["quantity"],1)
        self.assertRegex(valid["body"]["properties"]["_the_mile_proof"],r"^[0-9a-f]{64}$")
        self.assertEqual(request(self.signed_proxy())["body"]["hold_id"],
                         valid["body"]["hold_id"])
        self.assertEqual(request(self.signed_proxy(shop="bad.myshopify.com"))["status"],403)
        with patch.dict("os.environ",{"MILE_SHOPIFY_SESAMI_MIGRATED":"0"}):
            self.assertEqual(request(self.signed_proxy())["status"],404)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(request(self.signed_proxy())["status"],404)

    def test_signed_proxy_probe_works_with_checkout_disabled_without_writes(self):
        def probe(query, method="GET"):
            env = {
                "REQUEST_METHOD": method,
                "PATH_INFO": "/api/v2/shopify/app-proxy/ping",
                "QUERY_STRING": query,
                "wsgi.input": io.BytesIO(b""),
                "CONTENT_LENGTH": "0",
                "REMOTE_ADDR": "127.0.0.1",
            }
            response = {}
            def start(status, headers):
                response["status"] = int(status.split()[0])
                response["headers"] = dict(headers)
            response["body"] = json.loads(
                b"".join(app.application(env, start)))
            return response

        with patch.dict("os.environ", {
            "MILE_SHOPIFY_CHECKOUT_ENABLED": "0",
            "MILE_SHOPIFY_SESAMI_MIGRATED": "0",
        }):
            valid = probe(self.signed_proxy())
            self.assertEqual(valid["status"], 200, valid)
            self.assertIs(valid["body"]["app_proxy_verified"], True)
            self.assertIs(valid["body"]["checkout_enabled"], False)
            self.assertEqual(valid["headers"]["Cache-Control"], "no-store")
            self.assertEqual(probe(self.signed_proxy(shop="another.myshopify.com"))["status"], 403)
            self.assertEqual(probe(self.signed_proxy(timestamp=str(int(time.time())-700)))["status"], 403)
            self.assertEqual(probe(self.signed_proxy(path_prefix="/apps/other"))["status"], 403)
            self.assertEqual(probe(self.signed_proxy(), method="POST")["status"], 401)
            with patch.object(app, "SITE_ROLE", "player"):
                self.assertEqual(probe(self.signed_proxy())["status"], 404)
        with app.connect() as c:
            self.assertEqual(c.execute(
                "SELECT COUNT(*) AS n FROM appt_checkout_holds"
            ).fetchone()["n"], 0)
            self.assertEqual(c.execute(
                "SELECT COUNT(*) AS n FROM appt_shopify_confirmations"
            ).fetchone()["n"], 0)

    def test_webhook_paid_confirms_one_and_is_idempotent(self):
        cart=self.start()
        order=self.order(cart)
        result=self.webhook(order)
        self.assertEqual(result["status"],200,result)
        self.assertEqual(result["body"]["result"],"confirmed")
        repeated=self.webhook(order)
        self.assertEqual(repeated["body"]["result"],"confirmed")
        different_delivery=self.webhook(order,delivery="763d07ba-1a15-3b11-950e-2437cd210020")
        self.assertEqual(different_delivery["body"]["result"],"confirmed")
        with app.connect() as c:
            hold=c.execute("SELECT * FROM appt_checkout_holds WHERE id=?",
                           (cart["hold_id"],)).fetchone()
            confirmations=c.execute("SELECT * FROM appt_shopify_confirmations").fetchall()
            self.assertEqual(hold["status"],"confirmed")
            self.assertEqual(hold["shopify_order_id"],str(order["id"]))
            self.assertEqual(len(confirmations),1)
            self.assertEqual(confirmations[0]["customer_name"],"Pessoa Pagou")
            self.assertEqual(confirmations[0]["customer_email"],"cliente.pago@example.pt")
            self.assertEqual(bridge.payment_summary(c)["processed_deliveries"],2)
        self.assertEqual(self.admin.request(
            "/api/v2/admin/appointments/checkout/payment-status")["body"]
            ["confirmed_shopify_bookings"],1)
        listing=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+"&to="+self.day)
        self.assertEqual(listing["status"],200,listing)
        bookings=listing["body"]["bookings"]
        self.assertEqual(len(bookings),1)
        self.assertEqual(bookings[0]["source"],"shopify")
        self.assertEqual(bookings[0]["payment_status"],"paid")
        self.assertEqual(bookings[0]["status"],"scheduled")
        self.assertEqual(bookings[0]["shopify_order_id"],str(order["id"]))
        self.assertEqual(bookings[0]["customer_name"],"Pessoa Pagou")
        self.assertFalse(listing["body"]["internal_only"])
        cancelled=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+
            "&to="+self.day+"&status=cancelled")
        self.assertEqual(cancelled["body"]["bookings"],[])


    def confirmed(self, identifier=9001234567001):
        cart=self.start()
        order=self.order(cart,identifier)
        self.assertEqual(self.webhook(order)["body"]["result"],"confirmed")
        return cart,order

    def hold(self, hold_id):
        with app.connect() as c:
            return c.execute("SELECT * FROM appt_checkout_holds WHERE id=?",
                             (hold_id,)).fetchone()

    def test_shopify_cancellation_frees_paid_slot_idempotently(self):
        cart,order=self.confirmed()
        result=self.webhook({"id":order["id"],"cancel_reason":"customer"},
                            delivery="cancel-delivery-0001",topic="orders/cancelled")
        self.assertEqual(result["status"],200,result)
        self.assertEqual(result["body"]["result"],"released")
        self.assertEqual(self.hold(cart["hold_id"])["status"],"released")
        again=self.webhook({"id":order["id"]},delivery="cancel-delivery-0002",
                           topic="orders/cancelled")
        self.assertEqual(again["body"]["result"],"already_released")
        listing=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+"&to="+self.day)
        self.assertEqual(listing["body"]["bookings"],[])
        # The slot is bookable again.
        with app.connect() as c:
            other=bridge.create_checkout_hold(c,self.signed_proxy(),
                                              self.payload("after-cancel-key-0001"))
        self.assertNotEqual(other["hold_id"],cart["hold_id"])
        with app.connect() as c:
            change=c.execute("SELECT * FROM appt_shopify_booking_changes").fetchall()
        self.assertEqual([(x["action"],x["reason"]) for x in change],
                         [("released","shopify_order_cancelled")])

    def test_cancellation_of_unrelated_order_and_wrong_topic_change_nothing(self):
        cart,order=self.confirmed()
        unrelated=self.webhook({"id":9001234567999},delivery="cancel-delivery-0003",
                               topic="orders/cancelled")
        self.assertEqual(unrelated["body"]["result"],"ignored")
        # A cancellation body sent as orders/paid never frees the slot.
        wrong=self.webhook({"id":order["id"]},delivery="cancel-delivery-0004",
                           topic="orders/paid")
        self.assertEqual(wrong["body"]["result"],"ignored")
        # Header topic must match the endpoint's topic.
        with app.connect() as c, self.assertRaises(bridge.ShopifyBridgeError):
            bridge.handle_webhook(c,b"{}",{"X-Shopify-Topic":"orders/paid",
                "X-Shopify-Shop-Domain":SHOP},"orders/cancelled")
        tampered=self.webhook({"id":order["id"]},delivery="cancel-delivery-0005",
                              topic="orders/cancelled",tamper=True)
        self.assertEqual(tampered["status"],403)
        self.assertEqual(self.hold(cart["hold_id"])["status"],"confirmed")

    def test_refund_of_booking_line_frees_slot_but_other_refunds_do_not(self):
        cart,order=self.confirmed()
        other=self.webhook({"order_id":order["id"],"refund_line_items":[
            {"line_item":{"variant_id":123,"properties":[]}}]},
            delivery="refund-delivery-0001",topic="refunds/create")
        self.assertEqual(other["body"]["result"],"ignored")
        amount_only=self.webhook({"order_id":order["id"],"refund_line_items":[]},
            delivery="refund-delivery-0002",topic="refunds/create")
        self.assertEqual(amount_only["body"]["result"],"ignored")
        self.assertEqual(self.hold(cart["hold_id"])["status"],"confirmed")
        booking=self.webhook({"order_id":order["id"],"refund_line_items":[
            {"line_item":order["line_items"][0]}]},
            delivery="refund-delivery-0003",topic="refunds/create")
        self.assertEqual(booking["body"]["result"],"released")
        self.assertEqual(self.hold(cart["hold_id"])["status"],"released")

    def test_admin_reschedules_paid_booking_and_slot_moves(self):
        cart,order=self.confirmed()
        listing=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+"&to="+self.day)
        item=listing["body"]["bookings"][0]
        # Paying is not confirming presence: it starts as "Agendada".
        self.assertFalse(item["confirmed"])
        confirm="/api/v2/admin/appointments/bookings/"+cart["hold_id"]+"/confirmation"
        self.assertEqual(self.admin.request(confirm,"POST",
            {"source":"shopify","confirmed":True})["status"],200)
        listing=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+"&to="+self.day)
        item=listing["body"]["bookings"][0]
        self.assertTrue(item["confirmed"])
        path="/api/v2/admin/appointments/bookings/paid/"+cart["hold_id"]
        # The calendar can show its own current slot as free while moving it.
        base=("/api/v2/admin/appointments/slots-preview?professional_id="+self.pid+
              "&service_id="+self.service["id"]+"&mode=presencial&date="+self.day)
        starts=lambda q:[x["start"] for x in self.admin.request(base+q)["body"]["slots"]]
        self.assertNotIn("09:00",starts(""))
        self.assertIn("09:00",starts("&exclude_hold_id="+cart["hold_id"]))
        self.assertEqual(self.admin.request(base+"&exclude_hold_id="+"0"*32)["status"],404)
        # Overlapping its own current slot is allowed (it is being moved).
        moved=self.admin.request(path,"PUT",{"professional_id":self.pid,
            "date":self.day,"start":"10:00","version":item["version"]})
        self.assertEqual(moved["status"],200,moved)
        row=self.hold(cart["hold_id"])
        self.assertEqual((row["status"],row["start_minute"]),("confirmed",600))
        stale=self.admin.request(path,"PUT",{"professional_id":self.pid,
            "date":self.day,"start":"11:00","version":item["version"]})
        self.assertEqual(stale["status"],409,stale)
        outside=self.admin.request(path,"PUT",{"professional_id":self.pid,
            "date":self.day,"start":"12:30","version":row["updated_at"]})
        self.assertEqual(outside["status"],400,outside)
        self.assertEqual(self.hold(cart["hold_id"])["status"],"confirmed")
        # The old 09:00 start is free again for a new checkout.
        with app.connect() as c:
            fresh=bridge.create_checkout_hold(c,self.signed_proxy(),
                                              dict(self.payload("after-move-key-0001"),start="11:30"))
        self.assertTrue(fresh["hold_id"])
        listing=self.admin.request(
            "/api/v2/admin/appointments/bookings?from="+self.day+"&to="+self.day)
        paid=[b for b in listing["body"]["bookings"] if b["source"]=="shopify"]
        self.assertEqual((paid[0]["start"],paid[0]["shopify_order_id"]),
                         ("10:00",str(order["id"])))
        self.assertFalse(paid[0]["confirmed"])  # new time, new confirmation
        self.assertEqual(fixtures.Client().request(path,"PUT",{})["status"],401)
        with app.connect() as c:
            change=c.execute("SELECT * FROM appt_shopify_booking_changes").fetchone()
        self.assertEqual((change["action"],change["previous_start_minute"],
                          change["current_start_minute"]),("rescheduled",540,600))

    def test_phone_falls_back_to_billing_address(self):
        cart=self.start()
        order=self.order(cart)
        order["billing_address"]={"phone":"+351 912 345 678"}
        self.assertEqual(self.webhook(order)["body"]["result"],"confirmed")
        with app.connect() as c:
            row=c.execute("SELECT customer_phone FROM appt_shopify_confirmations").fetchone()
        self.assertEqual(row["customer_phone"],"+351 912 345 678")

    def test_invalid_hmac_wrong_shop_or_topic_never_changes_booking(self):
        cart=self.start()
        order=self.order(cart)
        for bad in (
            {"tamper":True},
            {"shop":"another.myshopify.com"},
            {"topic":"orders/create"},
        ):
            response=self.webhook(order,**bad)
            self.assertNotEqual(response["status"],200,response)
        with app.connect() as c:
            self.assertEqual(c.execute("SELECT status FROM appt_checkout_holds WHERE id=?",
                                       (cart["hold_id"],)).fetchone()["status"],"held")
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM appt_shopify_confirmations")
                             .fetchone()["n"],0)

    def test_expired_paid_order_gets_review_and_never_double_books(self):
        cart=self.start()
        order=self.order(cart)
        future=int(time.time())+901
        with app.connect() as c:
            outcome=bridge.process_paid_order(c,order,"fake-late-event-000001",now=future)
            self.assertEqual(outcome,"payment_review")
            self.assertEqual(c.execute("SELECT status FROM appt_checkout_holds WHERE id=?",
                                       (cart["hold_id"],)).fetchone()["status"],"held")
            self.assertEqual(c.execute("SELECT reason FROM appt_shopify_payment_reviews")
                             .fetchone()["reason"],"hold_expired_or_closed")
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM appt_shopify_confirmations")
                             .fetchone()["n"],0)

    def test_forged_cart_metadata_and_variant_mismatch_go_to_review(self):
        cart=self.start()
        order=self.order(cart)
        order["line_items"][0]["variant_id"]=111
        response=self.webhook(order)
        self.assertEqual(response["body"]["result"],"payment_review")
        with app.connect() as c:
            self.assertEqual(c.execute("SELECT status FROM appt_checkout_holds WHERE id=?",
                                       (cart["hold_id"],)).fetchone()["status"],"held")
        second=self.order(cart,identifier=9001234567002)
        second["line_items"][0]["properties"][0]["value"]="f"*32
        response=self.webhook(second,delivery="different-valid-delivery-id-000001")
        self.assertEqual(response["body"]["result"],"payment_review")

    def test_orders_without_mile_line_are_ignored(self):
        data={"id":9001234567777,"financial_status":"paid","currency":"EUR",
              "line_items":[{"variant_id":111,"quantity":1,"price":"15.00","properties":[]}]}
        r=self.webhook(data)
        self.assertEqual(r["status"],200,r)
        self.assertEqual(r["body"]["result"],"ignored")
        with app.connect() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) AS n FROM appt_shopify_confirmations")
                             .fetchone()["n"],0)

    def test_admin_readiness_reports_current_mapping_without_secrets(self):
        path="/api/v2/admin/appointments/checkout/payment-status"
        r=self.admin.request(path)
        self.assertEqual(r["status"],200,r)
        data=r["body"]
        self.assertTrue(data["shopify_app_secret_configured"])
        self.assertEqual(data["service_formats_enabled"],8)
        self.assertEqual(data["service_formats_mapped"],8)
        self.assertIsNone(data["shopify_app_installation_verified"])
        self.assertNotIn(SECRET,json.dumps(data))
        with app.connect() as c:
            c.execute("""UPDATE appt_service_formats SET shopify_variant_id=NULL
                WHERE org_id=? AND service_id=? AND mode='online'""",
                ("the-mile",self.service["id"]))
        changed=self.admin.request(path)["body"]
        self.assertEqual(changed["service_formats_enabled"],8)
        self.assertEqual(changed["service_formats_mapped"],7)
        with patch.dict("os.environ",{"MILE_SHOPIFY_APP_SECRET":""}):
            unconfigured=self.admin.request(path)["body"]
            self.assertFalse(unconfigured["shopify_app_secret_configured"])
            self.assertFalse(unconfigured["webhooks_enabled"])
            self.assertFalse(unconfigured["checkout_enabled"])

    def test_manual_calendar_checkout_does_not_claim_sesami_migration(self):
        # The previous Sesami app is uninstalled, but its old Google-only
        # appointments are not synced: the merchant chose manual blocks.
        flags = {
            "MILE_SHOPIFY_CHECKOUT_ENABLED": "1",
            "MILE_SHOPIFY_SESAMI_MIGRATED": "0",
            "MILE_SHOPIFY_MANUAL_CALENDAR_MODE": "1",
        }
        with patch.dict("os.environ", flags):
            self.assertTrue(bridge.checkout_enabled())
            response = self.admin.request(
                "/api/v2/admin/appointments/checkout/payment-status")
            self.assertEqual(response["status"], 200, response)
            self.assertTrue(response["body"]["checkout_enabled"])
            self.assertTrue(response["body"]["manual_calendar_mode_enabled"])
            self.assertFalse(response["body"]["sesami_migration_verified"])
            self.assertNotIn(SECRET, json.dumps(response["body"]))
        with patch.dict("os.environ", {**flags, "MILE_SHOPIFY_MANUAL_CALENDAR_MODE": "0"}):
            self.assertFalse(bridge.checkout_enabled())
        with patch.dict("os.environ", {**flags, "MILE_SHOPIFY_WEBHOOK_ENABLED": "0"}):
            self.assertFalse(bridge.checkout_enabled())

    def test_default_off_even_when_webhook_or_proxy_is_called(self):
        data={"id":9001234567777,"financial_status":"paid","currency":"EUR","line_items":[]}
        with patch.dict("os.environ",{"MILE_SHOPIFY_WEBHOOK_ENABLED":"0"}):
            self.assertEqual(self.webhook(data)["status"],404)
            with self.assertRaises(bridge.ShopifyBridgeError):
                bridge.verify_proxy(self.signed_proxy())
        with patch.dict("os.environ",{"MILE_SHOPIFY_SESAMI_MIGRATED":"0"}):
            self.assertEqual(self.admin.request(
                "/api/v2/admin/appointments/checkout/payment-status")["body"]
                ["checkout_enabled"],False)


if __name__=="__main__":
    unittest.main()
