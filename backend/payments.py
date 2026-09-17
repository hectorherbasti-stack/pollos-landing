"""Pasarelas alojadas: nunca recibe números de tarjeta, CVV ni códigos de Yape."""
import os
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


def mode():
    value = os.getenv('PAYMENTS_MODE', 'demo')
    if value not in ('demo', 'sandbox', 'live'):
        raise HTTPException(503, 'Configuración de pagos inválida')
    return value


def usd_rate():
    try:
        value = Decimal(os.getenv('PAYPAL_USD_PER_PEN', '0'))
        return value if value.is_finite() and 0 < value < 10 else Decimal(0)
    except InvalidOperation:
        return Decimal(0)


def configuration():
    demo = mode() == 'demo'
    paypal = bool(os.getenv('PAYPAL_CLIENT_ID') and os.getenv('PAYPAL_CLIENT_SECRET') and usd_rate())
    mercado = bool(os.getenv('MERCADOPAGO_ACCESS_TOKEN'))
    return {'mode': mode(), 'usdPerPen': str(usd_rate()), 'methods': [
        {'id': 'paypal', 'name': 'PayPal', 'available': demo or paypal},
        {'id': 'yape', 'name': 'Yape', 'available': demo or mercado},
        {'id': 'visa', 'name': 'Visa', 'available': demo or mercado},
    ]}


def request(method, url, **kwargs):
    try:
        response = httpx.request(method, url, timeout=15, **kwargs)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        # No reflejamos claves, datos del cliente ni errores internos de la pasarela.
        raise HTTPException(502, 'No se pudo consultar la pasarela. Reintenta sin crear otro pedido.') from None


def return_url(order):
    base = os.getenv('CHECKOUT_PUBLIC_URL', 'http://localhost:3000').rstrip('/')
    parsed = urlparse(base)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise HTTPException(503, 'Configura CHECKOUT_PUBLIC_URL')
    if mode() != 'demo' and parsed.scheme != 'https':
        raise HTTPException(503, 'La pasarela necesita CHECKOUT_PUBLIC_URL con HTTPS')
    return f"{base}/pedido/{order['id']}"


def paypal_credentials():
    base = 'https://api-m.paypal.com' if mode() == 'live' else 'https://api-m.sandbox.paypal.com'
    token = request('POST', f'{base}/v1/oauth2/token',
                    auth=(os.environ['PAYPAL_CLIENT_ID'], os.environ['PAYPAL_CLIENT_SECRET']),
                    data={'grant_type': 'client_credentials'})
    return base, {'Authorization': f"Bearer {token['access_token']}", 'Content-Type': 'application/json'}


def mp_headers():
    return {'Authorization': f"Bearer {os.environ['MERCADOPAGO_ACCESS_TOKEN']}"}


def start(order):
    callback = return_url(order)
    order_id = str(order['id'])
    if order['payment_method'] == 'paypal':
        base, headers = paypal_credentials()
        headers['PayPal-Request-Id'] = order_id
        result = request('POST', f'{base}/v2/checkout/orders', headers=headers, json={
            'intent': 'CAPTURE',
            'purchase_units': [{'reference_id': order_id, 'custom_id': order_id,
                'amount': {'currency_code': 'USD', 'value': f"{order['charge_cents'] / 100:.2f}"}}],
            'payment_source': {'paypal': {'experience_context': {
                'return_url': callback, 'cancel_url': callback + '?cancelled=1',
                'user_action': 'PAY_NOW', 'shipping_preference': 'NO_SHIPPING',
            }}},
        })
        link = next((link['href'] for link in result.get('links', []) if link['rel'] in ('payer-action', 'approve')), None)
    else:
        # El checkout alojado ofrece Yape y tarjetas según la cuenta peruana del comercio.
        result = request('POST', 'https://api.mercadopago.com/checkout/preferences', headers=mp_headers(), json={
            'items': [{'id': order_id, 'title': 'Pedido Julia · recojo en tienda', 'quantity': 1,
                       'currency_id': 'PEN', 'unit_price': order['total_cents'] / 100}],
            'payer': {'email': order['customer_email']}, 'external_reference': order_id,
            'back_urls': {'success': callback, 'pending': callback, 'failure': callback + '?cancelled=1'},
            'auto_return': 'approved',
            'payment_methods': {'installments': 1, 'default_payment_method_id': order['payment_method']},
        })
        link = result.get('init_point' if mode() == 'live' else 'sandbox_init_point')
    if not link or urlparse(link).scheme != 'https':
        raise HTTPException(502, 'La pasarela no devolvió un enlace de pago válido')
    return str(result['id']), link


def paypal_result(order, capture=False):
    base, headers = paypal_credentials()
    reference = order['provider_reference']
    result = request('GET', f'{base}/v2/checkout/orders/{reference}', headers=headers)
    if result.get('status') == 'APPROVED' and capture:
        headers['PayPal-Request-Id'] = f"capture-{order['id']}"
        result = request('POST', f'{base}/v2/checkout/orders/{reference}/capture', headers=headers, json={})
    if result.get('status') != 'COMPLETED' or result.get('id') != reference:
        return None
    units = result.get('purchase_units', [])
    if len(units) != 1 or units[0].get('custom_id') != str(order['id']):
        raise HTTPException(502, 'La referencia del pago no coincide')
    captures = units[0].get('payments', {}).get('captures', [])
    if len(captures) != 1 or captures[0].get('status') != 'COMPLETED':
        return None
    payment = captures[0]
    if payment.get('amount', {}).get('currency_code') != order['charge_currency'] or Decimal(payment['amount']['value']) * 100 != order['charge_cents']:
        raise HTTPException(502, 'El importe confirmado no coincide con el pedido')
    return 'paypal:' + payment['id']


def mercado_result(order):
    result = request('GET', 'https://api.mercadopago.com/v1/payments/search', headers=mp_headers(),
                     params={'external_reference': str(order['id']), 'sort': 'date_created', 'criteria': 'desc', 'limit': 20})
    for payment in result.get('results', []):
        if payment.get('status') != 'approved' or payment.get('external_reference') != str(order['id']):
            continue
        if payment.get('live_mode') != (order['payment_mode'] == 'live'):
            raise HTTPException(502, 'El entorno del pago no coincide con el pedido')
        if payment.get('currency_id') != 'PEN' or Decimal(str(payment.get('transaction_amount', 0))) * 100 != order['total_cents']:
            raise HTTPException(502, 'El importe confirmado no coincide con el pedido')
        return 'mercadopago:' + str(payment['id'])
    return None


def verify(order, capture=False):
    if order['payment_mode'] != mode():
        raise HTTPException(409, 'Este pedido pertenece a otro entorno de pagos')
    if not order['provider_reference']:
        return None
    return paypal_result(order, capture) if order['payment_method'] == 'paypal' else mercado_result(order)
