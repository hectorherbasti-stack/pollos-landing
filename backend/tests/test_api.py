"""Pruebas contra PostgreSQL con rollback: no guardan ventas de prueba."""
import os
import unittest

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


if __name__ == '__main__':
    unittest.main()
