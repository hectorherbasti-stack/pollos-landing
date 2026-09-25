"""Contrato HTTP y fallos del límite entre comercio y pagos; sin cobros externos."""
from decimal import Decimal
import json
import os
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from domain.errors import Conflict, Forbidden, GatewayFailure, InvalidInput, Unavailable
from infrastructure.remote_payments import RemotePayments
from payments_main import app, payment_gateway


def order_record(mode='sandbox', method='yape'):
    usd = method == 'paypal' and mode != 'demo'
    return {'id': uuid4(), 'payment_mode': mode, 'payment_method': method,
            'total_cents': 3625, 'charge_cents': 979 if usd else 3625,
            'charge_currency': 'USD' if usd else 'PEN', 'customer_email': 'test@example.com',
            'provider_reference': 'remote-123', 'owner_id': uuid4(),
            'customer_phone': '987654321', 'customer_name': 'Dato privado'}


def configuration(mode='sandbox'):
    return {'mode': mode, 'usdPerPen': '0.27', 'methods': [
        {'id': method, 'name': method, 'available': True} for method in ('paypal', 'yape', 'visa')]}


class PaymentServiceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'PAYMENTS_API_KEY': 'internal-test-key'})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.gateway = Mock()
        self.gateway.configuration.return_value = configuration()
        self.gateway.mode.return_value = 'sandbox'
        self.gateway.start.return_value = ('provider-123', 'https://checkout.example/pay')
        self.gateway.verify.return_value = 'provider:payment-123'
        app.dependency_overrides[payment_gateway] = lambda: self.gateway
        self.addCleanup(app.dependency_overrides.clear)
        self.client = self.enterContext(TestClient(app))
        self.remote = RemotePayments('http://testserver', 'internal-test-key', self.client.request)

    def test_private_endpoints_reject_unauthenticated_requests(self):
        self.assertEqual(self.client.get('/health').json()['service'], 'payments')
        for method, path, body in [('GET', '/v1/config', None), ('POST', '/v1/payments/start', {}),
                                   ('POST', '/v1/payments/verify', {})]:
            for headers in ({}, {'Authorization': 'Bearer wrong'}):
                response = self.client.request(method, path, json=body, headers=headers)
                self.assertEqual(response.status_code, 401)
        self.gateway.start.assert_not_called()
        self.gateway.verify.assert_not_called()

    def test_contract_round_trip_uses_same_quote_for_one_request(self):
        self.assertEqual(self.remote.configuration(), configuration())
        self.assertEqual(self.remote.mode(), 'sandbox')
        self.assertEqual(self.remote.usd_rate(), Decimal('0.27'))
        self.gateway.configuration.assert_called_once()
        self.assertEqual(self.remote.start(order_record()), ('provider-123', 'https://checkout.example/pay'))
        self.assertEqual(self.remote.verify(order_record(), capture=True), 'provider:payment-123')
        self.assertTrue(self.gateway.verify.call_args.args[1])

    def test_only_payment_fields_cross_the_boundary(self):
        order = order_record()
        self.remote.start(order)
        sent = self.gateway.start.call_args.args[0]
        self.assertEqual(sent['id'], order['id'])
        self.assertEqual(sent['total_cents'], 3625)
        self.assertNotIn('owner_id', sent)
        self.assertNotIn('customer_name', sent)
        self.assertNotIn('customer_phone', sent)

    def test_demo_never_calls_a_provider(self):
        self.gateway.mode.return_value = 'demo'
        self.gateway.configuration.return_value = configuration('demo')
        order = order_record('demo')
        with self.assertRaises(Forbidden):
            self.remote.start(order)
        self.assertIsNone(self.remote.verify(order, capture=True))
        self.gateway.start.assert_not_called()
        self.gateway.verify.assert_not_called()

    def test_wrong_mode_and_unavailable_method_fail_before_provider(self):
        with self.assertRaises(Conflict):
            self.remote.start(order_record('live'))
        with self.assertRaises(Conflict):
            self.remote.verify(order_record('live'))
        disabled = configuration()
        disabled['methods'][1]['available'] = False
        self.gateway.configuration.return_value = disabled
        with self.assertRaises(Unavailable):
            self.remote.start(order_record())
        self.gateway.start.assert_not_called()
        self.gateway.verify.assert_not_called()

    def test_rejects_invalid_internal_payloads(self):
        from contracts.payments_v1 import PaymentOrder
        order = PaymentOrder.from_record(order_record()).model_dump(mode='json')
        for changes in ({'total_cents': -1}, {'charge_currency': 'USD'}, {'charge_cents': 1},
                        {'unexpected': 'field'}, {'total_cents': True}):
            response = self.client.post('/v1/payments/start', json={**order, **changes},
                headers={'Authorization': 'Bearer internal-test-key'})
            self.assertEqual(response.status_code, 422, response.text)
        self.gateway.start.assert_not_called()

    def test_provider_failure_is_translated_without_returning_secrets(self):
        self.gateway.start.side_effect = GatewayFailure('Fallo de proveedor')
        with self.assertRaises(GatewayFailure):
            self.remote.start(order_record())
        self.gateway.verify.return_value = None
        self.assertIsNone(self.remote.verify(order_record()))

    def test_service_requires_its_own_key(self):
        with patch.dict(os.environ, {'PAYMENTS_API_KEY': ''}):
            with self.assertRaisesRegex(RuntimeError, 'PAYMENTS_API_KEY'):
                with TestClient(app):
                    pass


class RemotePaymentFailureTests(unittest.TestCase):
    def adapter(self, handler):
        client = self.enterContext(httpx.Client(transport=httpx.MockTransport(handler)))
        return RemotePayments('http://payments:8001', 'secret-test-key', client.request)

    def test_timeout_does_not_retry_mutations(self):
        calls = []

        def timeout(request):
            calls.append(request)
            raise httpx.ReadTimeout('network detail including secrets', request=request)

        adapter = self.adapter(timeout)
        with self.assertRaises(Unavailable) as error:
            adapter.start(order_record())
        self.assertEqual(len(calls), 1)
        self.assertNotIn('secrets', str(error.exception))
        self.assertEqual(calls[0].headers['Authorization'], 'Bearer secret-test-key')

    def test_malformed_responses_cannot_confirm_payments(self):
        for payload in ({}, {'payment_id': True}, {'payment_id': ''}, {'payment_id': 'ok', 'extra': 'field'}):
            with self.subTest(payload=payload):
                adapter = self.adapter(lambda request: httpx.Response(200, json=payload))
                with self.assertRaises(GatewayFailure):
                    adapter.verify(order_record())
        adapter = self.adapter(lambda request: httpx.Response(200, text='not JSON'))
        with self.assertRaises(GatewayFailure):
            adapter.verify(order_record())

    def test_http_failures_are_sanitized_and_preserve_error_categories(self):
        for status, error_type in [(401, Unavailable), (403, Forbidden), (409, Conflict),
                                   (422, InvalidInput), (502, GatewayFailure), (503, Unavailable), (500, GatewayFailure)]:
            with self.subTest(status=status):
                adapter = self.adapter(lambda request: httpx.Response(status, json={'detail': 'secret-token'}))
                with self.assertRaises(error_type) as error:
                    adapter.verify(order_record())
                self.assertNotIn('secret-token', str(error.exception))

    def test_invalid_configuration_is_rejected(self):
        for config in ({}, {**configuration(), 'usdPerPen': 'NaN'},
                       {**configuration(), 'methods': []}):
            adapter = self.adapter(lambda request: httpx.Response(200, json=config))
            with self.assertRaises(GatewayFailure):
                adapter.configuration()

    def test_missing_internal_key_fails_before_network(self):
        with self.assertRaises(Unavailable):
            RemotePayments('http://payments:8001', '')

    def test_uuid_and_amounts_are_serialized_without_private_data(self):
        calls = []

        def handler(request):
            calls.append(json.loads(request.content))
            return httpx.Response(200, json={'payment_id': None})

        order = order_record(method='paypal')
        self.assertIsNone(self.adapter(handler).verify(order, capture=True))
        self.assertEqual(calls[0]['order']['id'], str(order['id']))
        self.assertEqual(calls[0]['order']['charge_cents'], 979)
        self.assertNotIn('customer_phone', calls[0]['order'])


if __name__ == '__main__':
    unittest.main()
