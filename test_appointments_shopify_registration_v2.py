"""The Mile Booking app webhook registration (fake Shopify responses only)."""
import json
import unittest
from unittest.mock import patch

import app
import test_app as fixtures
import appointments_shopify_registration_v2 as registration

SECRET = "testing-only-shopify-secret-that-is-not-real-0001"
CLIENT = "a" * 32
ENV = {
    "MILE_SHOPIFY_CLIENT_ID": CLIENT,
    "MILE_SHOPIFY_APP_SECRET": SECRET,
    "MILE_SHOPIFY_SHOP_DOMAIN": "the-mile-sports-nutrition.myshopify.com",
    "MILE_SHOPIFY_WEBHOOK_ENABLED": "1",
    "MILE_SHOPIFY_CHECKOUT_ENABLED": "0",
    "MILE_SHOPIFY_SESAMI_MIGRATED": "0",
}
PATH = "/api/v2/admin/appointments/checkout"


class ShopifyWebhookRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(
            methodName="test_deactivation_revokes_session"
        )
        self.portal.setUp()
        self.admin = self.portal.admin
        self.env = patch.dict("os.environ", ENV)
        self.env.start()
        self.addCleanup(self.env.stop)

    def _mock(self, present=False):
        self.calls = []
        def fake(url, body, headers):
            self.calls.append((url, body, headers))
            if url.endswith("/admin/oauth/access_token"):
                self.assertIn(b"grant_type=client_credentials", body)
                self.assertIn(b"client_id=" + CLIENT.encode(), body)
                return {"access_token": "fake-token-value-not-real"}
            self.assertTrue(url.endswith("/admin/api/2026-10/graphql.json"))
            self.assertEqual(headers["X-Shopify-Access-Token"],
                             "fake-token-value-not-real")
            query = body["query"]
            if "webhookSubscriptions(" in query:
                return {"data": {"webhookSubscriptions": {
                    "nodes": [{
                        "id": "gid://shopify/WebhookSubscription/1",
                        "topic": "ORDERS_PAID",
                        "uri": registration.CALLBACK_URL,
                    }] if present else [],
                    "pageInfo": {"hasNextPage": False, "endCursor": None}
                }}}
            if "webhookSubscriptionCreate(" in query:
                self.assertEqual(body["variables"]["url"],
                                 registration.CALLBACK_URL)
                return {"data": {"webhookSubscriptionCreate": {
                    "webhookSubscription": {
                        "id": "gid://shopify/WebhookSubscription/2",
                        "topic": "ORDERS_PAID",
                        "uri": registration.CALLBACK_URL
                    },
                    "userErrors": []
                }}}
            raise AssertionError("Unexpected GraphQL request")
        return patch.object(registration, "_request_json", side_effect=fake)

    def test_ready_status_is_admin_only_and_does_not_disclose_secret(self):
        result = self.admin.request(PATH+"/webhook-setup")
        self.assertEqual(result["status"], 200, result)
        data = result["body"]
        self.assertTrue(data["client_id_configured"])
        self.assertTrue(data["secret_configured"])
        self.assertTrue(data["webhook_receiver_enabled"])
        self.assertFalse(data["checkout_enabled"])
        self.assertIsNone(data["shopify_subscription_verified"])
        self.assertNotIn(SECRET, json.dumps(data))
        self.assertNotIn(CLIENT, json.dumps(data))
        self.assertEqual(fixtures.Client().request(PATH+"/webhook-setup")["status"], 401)

    def test_registration_is_single_click_and_repeat_idempotent(self):
        with self._mock() as fake:
            r = self.admin.request(PATH+"/register-paid-webhook","POST",{})
        self.assertEqual(r["status"], 200, r)
        self.assertEqual(r["body"]["status"], "registered")
        self.assertEqual(r["body"]["destination"], registration.CALLBACK_URL)
        self.assertEqual(len(fake.call_args_list), 3)
        with self._mock(present=True) as repeated:
            r = self.admin.request(PATH+"/register-paid-webhook","POST",{})
        self.assertEqual(r["status"], 200, r)
        self.assertEqual(r["body"]["status"], "already_registered")
        self.assertEqual(len(repeated.call_args_list), 2)

    def test_default_off_client_id_and_secret_gates(self):
        for env in (
            {"MILE_SHOPIFY_CLIENT_ID":""},
            {"MILE_SHOPIFY_APP_SECRET":""},
            {"MILE_SHOPIFY_WEBHOOK_ENABLED":"0"},
            {"MILE_SHOPIFY_SHOP_DOMAIN":"other.myshopify.com"},
        ):
            with patch.dict("os.environ", env):
                with self._mock() as fake:
                    r = self.admin.request(
                        PATH+"/register-paid-webhook","POST",{})
                self.assertEqual(r["status"],409,r)
                self.assertEqual(fake.call_count,0)
        self.assertEqual(fixtures.Client().request(
            PATH+"/register-paid-webhook","POST",{})["status"],401)
        self.assertEqual(self.admin.request(
            PATH+"/register-paid-webhook","POST",{},csrf=False)["status"],403)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.admin.request(
                PATH+"/register-paid-webhook","POST",{})["status"],404)

    def test_external_failure_does_not_mutate_appointments(self):
        with patch.object(registration,"_request_json",
                          side_effect=registration.ShopifyRegistrationError(
                              "shopify_registration_unavailable")):
            response = self.admin.request(
                PATH+"/register-paid-webhook","POST",{})
        self.assertEqual(response["status"],503,response)
        self.assertEqual(response["body"]["error"],
                         "shopify_registration_unavailable")
        with app.connect() as c:
            booked = c.execute("SELECT COUNT(*) AS n FROM appt_shopify_confirmations"
                               ).fetchone()["n"]
            self.assertEqual(booked,0)


if __name__ == "__main__":
    unittest.main()
