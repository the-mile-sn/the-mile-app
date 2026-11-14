"""Admin-only isolated paid-booking rehearsal: no real Shopify order or durable writes.

The existing orders/paid endpoint has already been verified using a real
Shopify/Sesami purchase. This test now exercises the separate The Mile hold ->
signed cart line -> paid webhook -> backoffice booking path, entirely inside
one database SAVEPOINT. The storefront checkout stays disabled.
"""
import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import appointments_availability_v2 as availability
import appointments_bookings_v2 as bookings
import appointments_catalog_v2 as catalogue
import appointments_checkout_v2 as checkout
import appointments_shopify_bridge_v2 as bridge


class PaidBookingSmokeError(ValueError):
    pass


def run_paid_booking_smoke(c):
    """Exercise one fake, 100%-discounted paid order and undo ALL writes.

    The mock professional and the test hold are created in a SAVEPOINT on the
    same connection; no actual professionals or customer appointments are used.
    This is *not* evidence of a Shopify-originated paid booking.
    """
    if not bridge.webhook_enabled() or not bridge._secret():
        raise PaidBookingSmokeError('paid_smoke_webhook_not_configured')
    # Never run a synthetic-write rehearsal while public checkout is live.
    if bridge.checkout_enabled():
        raise PaidBookingSmokeError('paid_smoke_requires_checkout_off')

    chosen = None
    for service in catalogue.catalog(c)['services']:
        if not service['active']:
            continue
        for mode in ('online', 'presencial'):
            fmt = service['formats'].get(mode) or {}
            if (fmt.get('enabled') and
                    bridge.VARIANT_GID_RE.fullmatch(fmt.get('shopify_variant_id') or '') and
                    isinstance(fmt.get('price_cents'), int) and
                    fmt['price_cents'] > 0):
                chosen = (service['id'], mode)
                break
        if chosen:
            break
    if not chosen:
        raise PaidBookingSmokeError('paid_smoke_no_mapped_service')

    service_id, mode = chosen
    day = (datetime.now(ZoneInfo('Europe/Lisbon')).date() +
           timedelta(days=3)).isoformat()
    unique = secrets.token_hex(12)
    fake_order_id = int('9' + str(secrets.randbelow(10**13)).zfill(13))
    hold_id = None
    professional_id = None
    delivery_id = 'mile-paid-smoke-' + unique
    second_delivery = 'mile-paid-smoke-retry-' + unique

    c.execute('SAVEPOINT mile_paid_booking_smoke')
    try:
        professional_id = catalogue.save_professional(c, {
            'name': 'Simulacao privada de pagamento The Mile',
            'email': 'paid-smoke-' + unique + '@invalid.test',
            'active': True,
            'presencial_enabled': True,
            'online_enabled': True,
            'service_ids': [service_id],
        })
        availability.save_period(c, 'availability', {
            'professional_id': professional_id, 'date': day,
            'start': '09:00', 'end': '15:00',
        })
        hold = checkout.start_hold(c, {
            'professional_id': professional_id, 'service_id': service_id,
            'mode': mode, 'date': day, 'start': '10:00',
            'idempotency_key': 'mile-paid-smoke-' + unique,
        }, 'admin-paid-smoke')
        hold_id = hold['id']
        row = c.execute('SELECT * FROM appt_checkout_holds WHERE id=?',
                        (hold_id,)).fetchone()
        if not row or row['status'] != 'held':
            raise PaidBookingSmokeError('paid_smoke_hold_failed')
        cart = bridge.signed_cart_line(row)
        base_price = f"{row['price_cents'] / 100:.2f}"
        fake_order = {
            'id': fake_order_id, 'financial_status': 'paid',
            'currency': 'EUR', 'total_price': '0.00',
            'discount_codes': [{'code': 'SYNTHETIC_100', 'amount': base_price}],
            'customer': {'first_name': 'Teste', 'last_name': 'Privado'},
            'line_items': [{
                'variant_id': cart['variant_id'], 'quantity': 1,
                # Shopify order item price is checked against the catalogue
                # reference price, before discount; the order total is zero.
                'price': base_price,
                'total_discount': base_price,
                'properties': [{'name': k, 'value': v}
                               for k, v in cart['properties'].items()],
            }],
        }
        raw = json.dumps(fake_order, separators=(',', ':')).encode('utf-8')
        signature = base64.b64encode(hmac.new(
            bridge._secret(), raw, hashlib.sha256).digest()).decode('ascii')
        headers = {
            'X-Shopify-Shop-Domain': bridge._shop(),
            'X-Shopify-Topic': 'orders/paid',
            'X-Shopify-Hmac-Sha256': signature,
            'X-Shopify-Webhook-Id': delivery_id,
        }
        first = bridge.paid_webhook(c, raw, headers)
        repeated = bridge.paid_webhook(c, raw, headers)
        another = bridge.paid_webhook(c, raw, {
            **headers, 'X-Shopify-Webhook-Id': second_delivery,
        })
        if (first, repeated, another) != ('confirmed', 'confirmed', 'confirmed'):
            raise PaidBookingSmokeError('paid_smoke_confirmation_failed')

        records = c.execute('''SELECT hold_id FROM appt_shopify_confirmations
            WHERE org_id=? AND shopify_order_id=?''',
            (bridge.ORG_ID, str(fake_order_id))).fetchall()
        if len(records) != 1 or records[0]['hold_id'] != hold_id:
            raise PaidBookingSmokeError('paid_smoke_duplicate_booking')
        paid_hold = c.execute('''SELECT status FROM appt_checkout_holds
            WHERE id=?''', (hold_id,)).fetchone()
        if not paid_hold or paid_hold['status'] != 'confirmed':
            raise PaidBookingSmokeError('paid_smoke_hold_not_confirmed')

        # Prove that the exact admin agenda projection sees the payment.
        agenda = bookings.list_bookings(
            c, day, day, professional_id=professional_id)
        matching = [b for b in agenda['bookings']
                    if b['id'] == hold_id and b['source'] == 'shopify'
                    and b['payment_status'] == 'paid'
                    and b['shopify_order_id'] == str(fake_order_id)]
        if len(matching) != 1:
            raise PaidBookingSmokeError('paid_smoke_not_visible_in_backoffice')
    finally:
        c.execute('ROLLBACK TO SAVEPOINT mile_paid_booking_smoke')
        c.execute('RELEASE SAVEPOINT mile_paid_booking_smoke')

    # If a regression ever prevents rollback, fail explicitly instead of
    # reporting success; these are randomized, synthetic identifiers only.
    checks = [
        ('SELECT 1 FROM appt_professionals WHERE id=?', (professional_id,)),
        ('SELECT 1 FROM appt_checkout_holds WHERE id=?', (hold_id,)),
        ('SELECT 1 FROM appt_shopify_confirmations WHERE shopify_order_id=?',
         (str(fake_order_id),)),
        ('SELECT 1 FROM appt_shopify_webhook_deliveries WHERE delivery_id=?',
         (delivery_id,)),
    ]
    if any(c.execute(sql, params).fetchone() for sql, params in checks):
        raise PaidBookingSmokeError('paid_smoke_rollback_failed')

    return {
        'type': 'internal_paid_booking_simulation',
        'signed_hold_created': True,
        'signed_paid_notification_accepted': True,
        'one_booking_confirmed': True,
        'booking_visible_in_backoffice': True,
        'duplicate_deliveries_idempotent': True,
        'synthetic_full_discount_order_tested': True,
        'database_changes_persisted': False,
        'real_shopify_order_created': False,
        'real_booking_created': False,
        'payment_charged': False,
        'shopify_originated_paid_booking_verified': False,
        'checkout_enabled': bridge.checkout_enabled(),
    }
