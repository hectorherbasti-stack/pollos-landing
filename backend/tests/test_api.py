"""Pruebas contra PostgreSQL con rollback: no guardan ventas de prueba."""
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

import payments

import psycopg
from psycopg.rows import dict_row
from fastapi.testclient import TestClient

from main import app, connection


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()
        cls.headers = {'Authorization': f"Bearer {os.environ['BACKEND_API_KEY']}"}

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def setUp(self):
        self.conn = psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)
        app.dependency_overrides[connection] = lambda: self.conn
        self.product = self.conn.execute('''
            INSERT INTO products (name, description, sale_price_cents, cost_price_cents)
            VALUES ('Prueba transaccional', 'Solo test', 1450, 1050) RETURNING id
        ''').fetchone()['id']

    def tearDown(self):
        app.dependency_overrides.clear()
        self.conn.rollback()
        self.conn.close()

    def test_health_and_catalog(self):
        self.assertEqual(self.client.get('/health').json(), {'status': 'ok'})
        products = self.client.get('/products').json()
        self.assertTrue(any(p['id'] == self.product for p in products))
        self.assertTrue(all('costPriceCents' not in p for p in products))

    def test_private_routes_require_credentials(self):
        for headers in ({}, {'Authorization': 'Bearer incorrecto'}):
            self.assertEqual(self.client.get('/dashboard', headers=headers).status_code, 401)
            self.assertEqual(self.client.post('/sales', headers=headers, json={
                'productId': self.product, 'quantity': 1,
            }).status_code, 401)

    def test_sale_totals_and_historical_prices(self):
        before = self.client.get('/dashboard', headers=self.headers).json()['totals']
        response = self.client.post('/sales', headers=self.headers, json={
            'productId': self.product, 'quantity': 2.5,
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.conn.execute('UPDATE products SET sale_price_cents = 9999 WHERE id = %s', (self.product,))
        dashboard = self.client.get('/dashboard', headers=self.headers).json()
        self.assertEqual(dashboard['totals']['revenueCents'] - before['revenueCents'], 3625)
        self.assertEqual(dashboard['totals']['profitCents'] - before['profitCents'], 1000)
        sale = next(s for s in dashboard['recentSales'] if s['id'] == response.json()['id'])
        self.assertEqual(sale['quantity'], 2.5)
        self.assertEqual(sale['totalCents'], 3625)

    def test_invalid_quantities(self):
        for quantity in (0, -1, 1001, 0.001, 'NaN', 'Infinity'):
            with self.subTest(quantity=quantity):
                response = self.client.post('/sales', headers=self.headers, json={
                    'productId': self.product, 'quantity': quantity,
                })
                self.assertEqual(response.status_code, 422, response.text)

    def test_inactive_or_missing_product(self):
        self.conn.execute('UPDATE products SET active = FALSE WHERE id = %s', (self.product,))
        for product in (self.product, 9223372036854775807):
            response = self.client.post('/sales', headers=self.headers, json={
                'productId': product, 'quantity': 1,
            })
            self.assertEqual(response.status_code, 404)


    def checkout_headers(self, owner=None):
        return {**self.headers, 'X-Checkout-Owner': str(owner or self.owner)}

    def checkout_body(self, method='yape'):
        return {'requestKey': str(uuid4()), 'items': [{'productId': self.product, 'quantity': 2.5}],
                'customer': {'name': 'Cliente de prueba', 'email': 'test@example.com', 'phone': '987654321'},
                'paymentMethod': method}

    def new_order(self, method='yape'):
        self.owner = uuid4()
        response = self.client.post('/orders', headers=self.checkout_headers(), json=self.checkout_body(method))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_checkout_uses_database_prices_and_idempotency(self):
        self.owner = uuid4()
        body = self.checkout_body()
        first = self.client.post('/orders', headers=self.checkout_headers(), json=body)
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(first.json()['totalCents'], 3625)
        self.conn.execute('UPDATE products SET sale_price_cents = 9999 WHERE id = %s', (self.product,))
        again = self.client.post('/orders', headers=self.checkout_headers(), json=body)
        self.assertEqual(again.json()['id'], first.json()['id'])
        self.assertEqual(again.json()['totalCents'], 3625)
        body['items'][0]['quantity'] = 1
        conflict = self.client.post('/orders', headers=self.checkout_headers(), json=body)
        self.assertEqual(conflict.status_code, 409)

    def test_checkout_rejects_tampering_and_inactive_products(self):
        self.owner = uuid4()
        body = self.checkout_body()
        body['totalCents'] = 1
        self.assertEqual(self.client.post('/orders', headers=self.checkout_headers(), json=body).status_code, 422)
        del body['totalCents']
        body['items'].append(body['items'][0])
        self.assertEqual(self.client.post('/orders', headers=self.checkout_headers(), json=body).status_code, 422)
        body['items'].pop()
        self.conn.execute('UPDATE products SET active = FALSE WHERE id = %s', (self.product,))
        self.assertEqual(self.client.post('/orders', headers=self.checkout_headers(), json=body).status_code, 409)

    def test_checkout_owner_cannot_read_or_pay_another_order(self):
        order = self.new_order()
        path = '/orders/' + order['id']
        other = self.checkout_headers(uuid4())
        self.assertEqual(self.client.get(path, headers=other).status_code, 404)
        for action in ('pay', 'confirm', 'demo'):
            response = self.client.post(path + '/' + action, headers=other, json={'outcome': 'approved'})
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get(path).status_code, 401)

    def test_all_demo_methods_and_retries_do_not_create_sales(self):
        before = self.conn.execute('SELECT COUNT(*) AS count FROM sales').fetchone()['count']
        for method in ('paypal', 'yape', 'visa'):
            order = self.new_order(method)
            path = '/orders/' + order['id'] + '/demo'
            rejected = self.client.post(path, headers=self.checkout_headers(), json={'outcome': 'declined'})
            self.assertEqual(rejected.json()['status'], 'pending')
            for _ in range(2):
                approved = self.client.post(path, headers=self.checkout_headers(), json={'outcome': 'approved'})
                self.assertEqual(approved.json()['status'], 'simulated')
        self.assertEqual(self.conn.execute('SELECT COUNT(*) AS count FROM sales').fetchone()['count'], before)

    def test_cancelled_demo_cannot_be_paid(self):
        order = self.new_order()
        path = '/orders/' + order['id'] + '/demo'
        self.client.post(path, headers=self.checkout_headers(), json={'outcome': 'cancelled'})
        result = self.client.post(path, headers=self.checkout_headers(), json={'outcome': 'approved'})
        self.assertEqual(result.json()['status'], 'cancelled')

    def test_live_settlement_is_idempotent_and_demo_endpoint_is_disabled(self):
        with patch.dict(os.environ, {'PAYMENTS_MODE': 'live', 'MERCADOPAGO_ACCESS_TOKEN': 'unit-test'}):
            order = self.new_order()
            path = '/orders/' + order['id']
            self.assertEqual(self.client.post(path + '/demo', headers=self.checkout_headers(), json={'outcome': 'approved'}).status_code, 403)
            with patch('payments.verify', return_value='mercadopago:' + str(uuid4())) as verify:
                for _ in range(2):
                    result = self.client.post(path + '/confirm', headers=self.checkout_headers(), json={})
                    self.assertEqual(result.json()['status'], 'paid', result.text)
                self.assertEqual(verify.call_count, 1)
            count = self.conn.execute('SELECT COUNT(*) AS count FROM sales WHERE checkout_item_id IN (SELECT id FROM checkout_items WHERE order_id = %s)', (order['id'],)).fetchone()['count']
            self.assertEqual(count, 1)

    def test_provider_rejects_wrong_currency_amount_and_environment(self):
        order = {'id': uuid4(), 'payment_mode': 'live', 'total_cents': 3625}
        payment = {'id': 123, 'status': 'approved', 'external_reference': str(order['id']),
                   'live_mode': True, 'currency_id': 'PEN', 'transaction_amount': 36.25}
        from fastapi import HTTPException
        with patch.dict(os.environ, {'MERCADOPAGO_ACCESS_TOKEN': 'unit-test'}):
            with patch('payments.request', return_value={'results': [payment]}):
                self.assertEqual(payments.mercado_result(order), 'mercadopago:123')
            for key, value in [('currency_id', 'USD'), ('transaction_amount', 1), ('live_mode', False)]:
                with patch('payments.request', return_value={'results': [{**payment, key: value}]}):
                    with self.assertRaises(HTTPException):
                        payments.mercado_result(order)
            with patch('payments.request', return_value={'results': [{**payment, 'external_reference': str(uuid4())}]}):
                self.assertIsNone(payments.mercado_result(order))

    def test_paypal_confirmation_requires_completed_capture_and_exact_amount(self):
        order = {'id': uuid4(), 'provider_reference': 'REMOTE123', 'charge_currency': 'USD', 'charge_cents': 1000}
        result = {'id': 'REMOTE123', 'status': 'COMPLETED', 'purchase_units': [
            {'custom_id': str(order['id']), 'payments': {'captures': [
                {'id': 'CAPTURE123', 'status': 'COMPLETED', 'amount': {'currency_code': 'USD', 'value': '10.00'}}]}}]}
        from fastapi import HTTPException
        with patch('payments.paypal_credentials', return_value=('https://example.invalid', {})):
            with patch('payments.request', return_value=result):
                self.assertEqual(payments.paypal_result(order), 'paypal:CAPTURE123')
            result['purchase_units'][0]['payments']['captures'][0]['amount']['value'] = '0.01'
            with patch('payments.request', return_value=result):
                with self.assertRaises(HTTPException):
                    payments.paypal_result(order)


if __name__ == '__main__':
    unittest.main()
