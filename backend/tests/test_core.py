"""Reglas de negocio probadas sin FastAPI, PostgreSQL ni conexión a pasarelas."""
import ast
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
import unittest
from unittest.mock import Mock
from uuid import uuid4

from application.catalog import Catalog, Sales
from application.checkout import Checkout
from domain.errors import Conflict, Forbidden, InvalidInput, NotFound
from domain.orders import Customer, NewOrder, OrderLine, converted_total, line_total, validate_total


class MemoryOrders:
    """Doble del repositorio. La concurrencia se valida contra PostgreSQL, no aquí."""
    def __init__(self):
        self.orders = {}
        self.lines = {}
        self.sales = []
        self.products = [{'id': 1, 'name': 'Pollo', 'sale_price_cents': 1450, 'cost_price_cents': 1050}]

    def find_request(self, owner, request_key):
        return next((order.copy() for order in self.orders.values()
                     if order['owner_id'] == owner and order['request_key'] == request_key), None)

    def active_products(self, ids):
        return [row.copy() for row in self.products if row['id'] in ids]

    def create(self, owner, command, digest, mode, total, charge, currency, lines):
        order = {'id': uuid4(), 'owner_id': owner, 'request_key': command.request_key,
                 'request_hash': digest, 'status': 'pending', 'payment_mode': mode,
                 'payment_method': command.payment_method, 'total_cents': total,
                 'charge_cents': charge, 'charge_currency': currency, 'created_at': 'today',
                 'checkout_url': None, 'provider_reference': None}
        self.orders[order['id']] = order
        self.lines[order['id']] = [{'productId': row['id'], 'name': row['name'], 'quantity': quantity,
                                    'unitPriceCents': row['sale_price_cents'], 'totalCents': amount}
                                   for row, quantity, amount in lines]
        return order.copy()

    def get_owned(self, order_id, owner):
        order = self.orders.get(order_id)
        return order.copy() if order and order['owner_id'] == owner else None

    def items(self, order_id):
        return self.lines[order_id]

    def save_checkout(self, order_id, reference, url):
        self.orders[order_id].update(provider_reference=reference, checkout_url=url)

    def set_status(self, order_id, status):
        self.orders[order_id]['status'] = status

    def settle(self, order_id, status, payment_id):
        self.orders[order_id].update(status=status, payment_id=payment_id)
        if status == 'paid':
            self.sales.extend(self.lines[order_id])

    def pending(self, mode):
        return [order.copy() for order in self.orders.values()
                if order['status'] == 'pending' and order['payment_mode'] == mode and order['provider_reference']]


class StubPayments:
    def __init__(self, mode='demo'):
        self.environment = mode
        self.start = Mock(return_value=('reference', 'https://checkout.example/test'))
        self.verify = Mock(return_value='payment:123')

    def mode(self):
        return self.environment

    def usd_rate(self):
        return Decimal('0.27')

    def configuration(self):
        return {'mode': self.mode(), 'methods': [
            {'id': method, 'available': True} for method in ('paypal', 'yape', 'visa')]}


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.repository = MemoryOrders()
        self.payments = StubPayments()
        self.checkout = Checkout(self.repository, self.payments)
        self.owner = uuid4()
        self.command = NewOrder(uuid4(), (OrderLine(1, Decimal('2.5')),),
                                Customer('Cliente', 'test@example.com', '987654321'), 'yape')

    def create_order(self):
        self.checkout.create(self.command, self.owner, 'same-body')
        return next(iter(self.repository.orders))

    def test_rounding_and_limits(self):
        self.assertEqual(line_total(1450, Decimal('0.01')), 15)
        self.assertEqual(converted_total(3625, Decimal('0.27')), 979)
        for quantity in ('0', '-1', '1001', '0.001', 'NaN', 'Infinity'):
            with self.subTest(quantity=quantity), self.assertRaises(InvalidInput):
                OrderLine(1, Decimal(quantity))
        for total in (0, 100000001):
            with self.assertRaises(InvalidInput):
                validate_total(total)
        with self.assertRaises(InvalidInput):
            converted_total(1, Decimal('0.01'))

    def test_retry_preserves_prices_and_rejects_changed_content(self):
        first = self.checkout.create(self.command, self.owner, 'same-body')
        self.repository.products[0]['sale_price_cents'] = 9999
        self.assertEqual(self.checkout.create(self.command, self.owner, 'same-body'), first)
        self.assertEqual(first['totalCents'], 3625)
        with self.assertRaises(Conflict):
            self.checkout.create(self.command, self.owner, 'changed-body')
        self.assertEqual(len(self.repository.orders), 1)

    def test_duplicate_and_unavailable_products_do_not_create_orders(self):
        with self.assertRaises(InvalidInput):
            self.checkout.create(replace(self.command, items=self.command.items * 2), self.owner, 'duplicate')
        self.repository.products.clear()
        with self.assertRaises(Conflict):
            self.checkout.create(self.command, self.owner, 'missing')
        self.assertFalse(self.repository.orders)

    def test_owner_is_checked_before_all_order_operations(self):
        order_id = self.create_order()
        for operation in (self.checkout.get, self.checkout.pay, self.checkout.confirm,
                          lambda oid, owner: self.checkout.simulate(oid, owner, 'approved')):
            with self.subTest(operation=operation), self.assertRaises(NotFound):
                operation(order_id, uuid4())
        self.payments.start.assert_not_called()
        self.payments.verify.assert_not_called()

    def test_demo_retries_and_cancellation_never_create_sales(self):
        order_id = self.create_order()
        self.assertEqual(self.checkout.simulate(order_id, self.owner, 'declined')['status'], 'pending')
        self.assertEqual(self.checkout.simulate(order_id, self.owner, 'cancelled')['status'], 'cancelled')
        self.assertEqual(self.checkout.simulate(order_id, self.owner, 'approved')['status'], 'cancelled')
        self.assertFalse(self.repository.sales)
        self.payments.verify.assert_not_called()

    def test_confirm_is_idempotent_and_only_live_creates_sales(self):
        for mode in ('demo', 'sandbox', 'live'):
            with self.subTest(mode=mode):
                self.setUp()
                self.payments.environment = mode
                order_id = self.create_order()
                first = self.checkout.confirm(order_id, self.owner)
                second = self.checkout.confirm(order_id, self.owner)
                self.assertEqual(first, second)
                self.assertEqual(first['status'], {'demo': 'pending', 'sandbox': 'test_paid', 'live': 'paid'}[mode])
                self.assertEqual(len(self.repository.sales), 1 if mode == 'live' else 0)
                self.assertEqual(self.payments.verify.call_count, 0 if mode == 'demo' else 1)

    def test_payment_link_is_reused_and_environment_changes_rejected(self):
        self.payments.environment = 'sandbox'
        order_id = self.create_order()
        first = self.checkout.pay(order_id, self.owner)
        self.assertEqual(self.checkout.pay(order_id, self.owner), first)
        self.payments.start.assert_called_once()
        with self.assertRaises(Forbidden):
            self.checkout.simulate(order_id, self.owner, 'approved')
        self.payments.environment = 'live'
        with self.assertRaises(Conflict):
            self.checkout.pay(order_id, self.owner)

    def test_unverified_payment_does_not_change_status(self):
        self.payments.environment = 'live'
        self.payments.verify.return_value = None
        order_id = self.create_order()
        self.assertEqual(self.checkout.confirm(order_id, self.owner)['status'], 'pending')
        self.assertFalse(self.repository.sales)

    def test_paypal_conversion_and_reconciliation(self):
        self.payments.environment = 'sandbox'
        self.command = replace(self.command, payment_method='paypal')
        order_id = self.create_order()
        order = self.checkout.get(order_id, self.owner)
        self.assertEqual((order['chargeCurrency'], order['chargeCents']), ('USD', 979))
        self.checkout.pay(order_id, self.owner)
        self.assertEqual(self.checkout.reconcile(), {'checked': 1})
        self.assertEqual(self.checkout.reconcile(), {'checked': 0})
        self.assertFalse(self.repository.sales)

    def test_catalog_only_returns_public_fields(self):
        repository = Mock()
        repository.list_active.return_value = [{'id': 1, 'name': 'Pollo', 'description': 'Fresco',
            'emoji': '🍗', 'salePriceCents': 1450, 'costPriceCents': 1050, 'private': 'internal'}]
        product = Catalog(repository).list_products()[0]
        self.assertEqual(set(product), {'id', 'name', 'description', 'emoji', 'salePriceCents'})

    def test_sales_validate_before_repository_and_report_missing_product(self):
        repository = Mock()
        sales = Sales(repository)
        with self.assertRaises(InvalidInput):
            sales.record(1, Decimal('0.001'))
        repository.record.assert_not_called()
        repository.record.return_value = None
        with self.assertRaises(NotFound):
            sales.record(1, Decimal('1'))


class ArchitectureTests(unittest.TestCase):
    def test_core_dependencies_point_inward(self):
        root = Path(__file__).resolve().parents[1]
        standard = {'__future__', 'dataclasses', 'decimal', 'uuid', 'typing'}
        for layer, allowed in [('domain', standard | {'domain'}),
                               ('application', standard | {'domain', 'application'})]:
            for path in (root / layer).glob('*.py'):
                for node in ast.walk(ast.parse(path.read_text())):
                    modules = ([node.module] if isinstance(node, ast.ImportFrom)
                               else [alias.name for alias in node.names] if isinstance(node, ast.Import) else [])
                    for module in modules:
                        with self.subTest(file=path.name, module=module):
                            self.assertIn(module.split('.')[0], allowed)


if __name__ == '__main__':
    unittest.main()
