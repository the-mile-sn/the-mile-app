"""No live Shopify credentials, orders, reservations or payments used by these tests."""
import json
import unittest
from unittest.mock import patch

import app
import test_app as fixtures
import appointments_shopify_bridge_v2 as bridge
import appointments_shopify_smoke_v2 as smoke

PATH="/api/v2/admin/appointments/checkout/smoke-test"
CONFIG={
    "MILE_SHOPIFY_APP_SECRET":"test-signing-secret-not-for-real-2026-verified",
    "MILE_SHOPIFY_SHOP_DOMAIN":"the-mile-sports-nutrition.myshopify.com",
    "MILE_SHOPIFY_WEBHOOK_ENABLED":"1",
    "MILE_SHOPIFY_CHECKOUT_ENABLED":"0",
    "MILE_SHOPIFY_SESAMI_MIGRATED":"0",
}

class SafeWebhookSmokeTests(unittest.TestCase):
    def setUp(self):
        self.portal=fixtures.PortalTest(
            methodName="test_deactivation_revokes_session")
        self.portal.setUp()
        self.admin=self.portal.admin
        self.env=patch.dict("os.environ", CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)

    def _counts(self):
        with app.connect() as c:
            return {
                key:c.execute("SELECT COUNT(*) AS n FROM "+table).fetchone()["n"]
                for key,table in (
                    ("deliveries","appt_shopify_webhook_deliveries"),
                    ("confirmed","appt_shopify_confirmations"),
                    ("reviews","appt_shopify_payment_reviews"),
                    ("holds","appt_checkout_holds"),
                    ("bookings","appt_bookings")
                )
            }

    def test_smoke_hmac_replay_and_no_persistent_writes(self):
        before=self._counts()
        result=self.admin.request(PATH,"POST",{})
        self.assertEqual(result["status"],200,result)
        data=result["body"]
        for flag in ("signature_accepted","unrelated_order_ignored",
                     "duplicate_delivery_idempotent","forged_signature_rejected",
                     "wrong_shop_rejected","wrong_topic_rejected",
                     "invalid_json_rejected"):
            self.assertIs(data[flag],True,(flag,data))
        self.assertIs(data["database_changes_persisted"],False)
        self.assertIs(data["created_order"],False)
        self.assertIs(data["created_booking"],False)
        self.assertIs(data["charged_payment"],False)
        self.assertIs(data["shopify_originated_delivery_verified"],False)
        self.assertIs(data["checkout_enabled"],False)
        self.assertNotIn(CONFIG["MILE_SHOPIFY_APP_SECRET"],json.dumps(data))
        self.assertEqual(self._counts(),before)
        again=self.admin.request(PATH,"POST",{})
        self.assertEqual(again["status"],200,again)
        self.assertEqual(self._counts(),before)

    def test_requires_admin_and_csrf_and_never_runs_on_player_app(self):
        self.assertEqual(fixtures.Client().request(PATH,"POST",{})["status"],401)
        self.assertEqual(self.admin.request(PATH,"POST",{},csrf=False)["status"],403)
        self.assertEqual(self.admin.request(PATH,"GET")["status"],404)
        with patch.object(app,"SITE_ROLE","player"):
            self.assertEqual(self.admin.request(PATH,"POST",{})["status"],404)

    def test_requires_real_owned_app_secret_and_webhook_enabled(self):
        for changed in (
            {"MILE_SHOPIFY_APP_SECRET":""},
            {"MILE_SHOPIFY_SHOP_DOMAIN":"bad-domain.myshopify.com"},
            {"MILE_SHOPIFY_WEBHOOK_ENABLED":"0"},
        ):
            with patch.dict("os.environ",changed):
                result=self.admin.request(PATH,"POST",{})
                self.assertEqual(result["status"],409,result)
                self.assertEqual(result["body"]["error"],"smoke_webhook_not_configured")

    def test_rolls_back_when_validation_fails(self):
        before=self._counts()
        with patch.object(bridge,"paid_webhook",side_effect=smoke.SmokeTestError(
                "smoke_webhook_validation_failed")):
            response=self.admin.request(PATH,"POST",{})
        self.assertEqual(response["status"],503,response)
        self.assertEqual(response["body"]["error"],"smoke_webhook_validation_failed")
        self.assertEqual(self._counts(),before)

if __name__=="__main__":
    unittest.main()
