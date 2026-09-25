"""HTTP real hacia el contenedor payments + repositorio PostgreSQL con rollback."""
import os
import unittest
from uuid import uuid4

import httpx
import psycopg
from psycopg.rows import dict_row
from fastapi.testclient import TestClient

from infrastructure.remote_payments import RemotePayments
from main import app, connection, payment_gateway


@unittest.skipUnless(os.getenv('TEST_PAYMENTS_SERVICE_URL'), 'Requiere compose.test.yaml')
class MicroserviceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def setUp(self):
        self.conn = psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)
        app.dependency_overrides[connection] = lambda: self.conn
        app.dependency_overrides[payment_gateway] = lambda: RemotePayments(
            os.environ['TEST_PAYMENTS_SERVICE_URL'], os.environ['PAYMENTS_API_KEY'])
        self.owner = uuid4()
        self.headers = {'Authorization': f"Bearer {os.environ['BACKEND_API_KEY']}",
                        'X-Checkout-Owner': str(self.owner)}
        self.product = self.conn.execute('''INSERT INTO products (name, description, sale_price_cents, cost_price_cents)
            VALUES ('Microservices test', 'Rollback', 1450, 1050) RETURNING id''').fetchone()['id']

    def tearDown(self):
        app.dependency_overrides.clear()
        self.conn.rollback()
        self.conn.close()

    def body(self, method):
        return {'requestKey': str(uuid4()), 'items': [{'productId': self.product, 'quantity': 2.5}],
                'customer': {'name': 'Prueba', 'email': 'test@example.com', 'phone': '987654321'},
                'paymentMethod': method}

    def test_remote_demo_checkout_all_methods_and_idempotency(self):
        response = self.client.get('/checkout/config', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['mode'], 'demo')
        before = self.conn.execute('SELECT COUNT(*) AS count FROM sales').fetchone()['count']
        for method in ('paypal', 'yape', 'visa'):
            body = self.body(method)
            created = self.client.post('/orders', json=body, headers=self.headers)
            self.assertEqual(created.status_code, 201, created.text)
            order = created.json()
            self.assertEqual(order['totalCents'], 3625)
            again = self.client.post('/orders', json=body, headers=self.headers)
            self.assertEqual(again.json()['id'], order['id'])
            path = '/orders/' + order['id']
            self.assertEqual(self.client.post(path + '/pay', headers=self.headers).json(),
                             {'url': '/pedido/' + order['id']})
            for _ in range(2):
                result = self.client.post(path + '/demo', json={'outcome': 'approved'}, headers=self.headers)
                self.assertEqual(result.json()['status'], 'simulated', result.text)
            other = {**self.headers, 'X-Checkout-Owner': str(uuid4())}
            self.assertEqual(self.client.get(path, headers=other).status_code, 404)
        self.assertEqual(self.conn.execute('SELECT COUNT(*) AS count FROM sales').fetchone()['count'], before)

    def test_payments_outage_keeps_catalog_and_existing_orders_readable(self):
        created = self.client.post('/orders', json=self.body('yape'), headers=self.headers)
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()['id']

        def unavailable(*args, **kwargs):
            raise httpx.ConnectError('Payment service offline')

        app.dependency_overrides[payment_gateway] = lambda: RemotePayments(
            'http://payments:8001', 'test-key', unavailable)
        self.assertEqual(self.client.get('/products').status_code, 200)
        path = '/orders/' + order_id
        self.assertEqual(self.client.get(path, headers=self.headers).json()['status'], 'pending')
        self.assertEqual(self.client.get('/checkout/config', headers=self.headers).status_code, 503)
        self.assertEqual(self.client.post(path + '/pay', headers=self.headers).status_code, 503)
        self.assertEqual(self.client.post('/orders', json=self.body('visa'), headers=self.headers).status_code, 503)
        row = self.conn.execute('SELECT status, payment_id FROM checkout_orders WHERE id = %s', (order_id,)).fetchone()
        self.assertEqual(row, {'status': 'pending', 'payment_id': None})

    def test_running_commerce_process_uses_remote_configuration(self):
        # El contenedor backend carece de credenciales de pasarela; sirve el contrato remoto.
        response = httpx.get('http://backend:8000/checkout/config', headers=self.headers, timeout=10)
        self.assertEqual(response.status_code, 200, response.text)
        remote = httpx.get('http://payments:8001/v1/config',
            headers={'Authorization': f"Bearer {os.environ['PAYMENTS_API_KEY']}"}, timeout=5)
        self.assertEqual(remote.status_code, 200, remote.text)
        self.assertEqual(response.json(), remote.json())
        response = httpx.get(os.environ['TEST_PAYMENTS_SERVICE_URL'] + '/v1/config', timeout=5)
        self.assertEqual(response.status_code, 401)


if __name__ == '__main__':
    unittest.main()
