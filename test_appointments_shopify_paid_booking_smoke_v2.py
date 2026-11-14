"""Isolated paid-booking smoke; no Shopify calls or durable orders/bookings."""
import json
import unittest
from unittest.mock import patch

import app
import test_app as fixtures
import appointments_shopify_bridge_v2 as bridge

PATH = '/api/v2/admin/appointments/checkout/paid-booking-smoke-test'
CONFIG = {
    'MILE_SHOPIFY_APP_SECRET': 'synthetic-only-signature-secret-2026-never-live',
    'MILE_SHOPIFY_SHOP_DOMAIN': 'the-mile-sports-nutrition.myshopify.com',
    'MILE_SHOPIFY_WEBHOOK_ENABLED': '1',
    'MILE_SHOPIFY_CHECKOUT_ENABLED': '0',
    'MILE_SHOPIFY_SESAMI_MIGRATED': '0',
}


class PaidBookingSmokeTests(unittest.TestCase):
    def setUp(self):
        self.portal = fixtures.PortalTest(
            methodName='test_deactivation_revokes_session')
        self.portal.setUp()
        self.admin = self.portal.admin
        self.env = patch.dict('os.environ', CONFIG)
        self.env.start()
        self.addCleanup(self.env.stop)

    def counts(self):
        tables = ('appt_professionals', 'appt_availability_periods',
                  'appt_checkout_holds', 'appt_bookings',
                  'appt_shopify_confirmations', 'appt_shopify_webhook_deliveries',
                  'appt_shopify_payment_reviews')
        with app.connect() as c:
            return {t: c.execute('SELECT COUNT(*) AS n FROM ' + t)
                    .fetchone()['n'] for t in tables}

    def test_rehearses_signed_paid_booking_and_rolls_back_all_changes(self):
        before = self.counts()
        result = self.admin.request(PATH, 'POST', {})
        self.assertEqual(result['status'], 200, result)
        data = result['body']
        for key in ('signed_hold_created', 'signed_paid_notification_accepted',
                    'one_booking_confirmed', 'booking_visible_in_backoffice',
                    'duplicate_deliveries_idempotent',
                    'synthetic_full_discount_order_tested'):
            self.assertIs(data[key], True, (key, data))
        for key in ('database_changes_persisted', 'real_shopify_order_created',
                    'real_booking_created', 'payment_charged',
                    'shopify_originated_paid_booking_verified', 'checkout_enabled'):
            self.assertIs(data[key], False, (key, data))
        self.assertNotIn(CONFIG['MILE_SHOPIFY_APP_SECRET'], json.dumps(data))
        self.assertEqual(before, self.counts())
        repeated = self.admin.request(PATH, 'POST', {})
        self.assertEqual(repeated['status'], 200, repeated)
        self.assertEqual(before, self.counts())

    def test_admin_csrf_role_and_method_boundaries(self):
        self.assertEqual(fixtures.Client().request(PATH, 'POST', {})['status'], 401)
        self.assertEqual(self.admin.request(PATH, 'POST', {}, csrf=False)['status'], 403)
        self.assertEqual(self.admin.request(PATH, 'GET')['status'], 404)
        with patch.object(app, 'SITE_ROLE', 'player'):
            self.assertEqual(self.admin.request(PATH, 'POST', {})['status'], 404)

    def test_requires_webhooks_and_checkout_to_remain_off(self):
        for changed in ({'MILE_SHOPIFY_APP_SECRET': ''},
                        {'MILE_SHOPIFY_WEBHOOK_ENABLED': '0'}):
            with patch.dict('os.environ', changed):
                result = self.admin.request(PATH, 'POST', {})
                self.assertEqual(result['status'], 409, result)
                self.assertEqual(result['body']['error'],
                                 'paid_smoke_webhook_not_configured')
        with patch.dict('os.environ', {
            'MILE_SHOPIFY_CHECKOUT_ENABLED': '1',
            'MILE_SHOPIFY_SESAMI_MIGRATED': '1',
        }):
            result = self.admin.request(PATH, 'POST', {})
            self.assertEqual(result['status'], 409, result)
            self.assertEqual(result['body']['error'],
                             'paid_smoke_requires_checkout_off')

    def test_signed_webhook_failure_rolls_back_fixture(self):
        before = self.counts()
        with patch.object(bridge, 'paid_webhook', return_value='ignored'):
            result = self.admin.request(PATH, 'POST', {})
        self.assertEqual(result['status'], 503, result)
        self.assertEqual(result['body']['error'],
                         'paid_smoke_confirmation_failed')
        self.assertEqual(before, self.counts())


if __name__ == '__main__':
    unittest.main()
