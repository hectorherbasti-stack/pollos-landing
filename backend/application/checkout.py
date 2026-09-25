"""Orquestación de pedidos. Sin HTTP, SQL, variables de entorno ni clientes de red."""
from uuid import UUID

from application.ports import OrderRepository, Payments
from domain.errors import Conflict, Forbidden, InvalidInput, NotFound, Unavailable
from domain.orders import NewOrder, converted_total, line_total, validate_total


class Checkout:
    def __init__(self, repository: OrderRepository, payments: Payments):
        self.repository = repository
        self.payments = payments

    def configuration(self):
        return self.payments.configuration()

    def serialize(self, order):
        return {'id': str(order['id']), 'status': order['status'], 'mode': order['payment_mode'],
                'paymentMethod': order['payment_method'], 'totalCents': order['total_cents'],
                'chargeCents': order['charge_cents'], 'chargeCurrency': order['charge_currency'],
                'items': self.repository.items(order['id']), 'createdAt': order['created_at']}

    def owned_order(self, order_id, owner):
        order = self.repository.get_owned(order_id, owner)
        if order is None:
            raise NotFound('Pedido no encontrado en esta sesión')
        return order

    def create(self, command: NewOrder, owner: UUID, digest: str):
        # El adaptador HTTP entrega el mismo hash canónico usado antes de la migración.
        existing = self.repository.find_request(owner, command.request_key)
        if existing:
            if existing['request_hash'] != digest:
                raise Conflict('La solicitud ya existe con otro contenido')
            return self.serialize(existing)
        config = self.payments.configuration()
        if not any(method['id'] == command.payment_method and method['available']
                   for method in config['methods']):
            raise Unavailable('Este método de pago todavía no está configurado')
        command.validate()
        ids = [line.product_id for line in command.items]
        rows = self.repository.active_products(ids)
        if len(rows) != len(ids):
            raise Conflict('Un producto ya no está disponible. Actualiza el carrito.')
        quantities = {line.product_id: line.quantity for line in command.items}
        lines = [(row, quantities[row['id']], line_total(row['sale_price_cents'], quantities[row['id']]))
                 for row in rows]
        total = sum(line[2] for line in lines)
        validate_total(total)
        currency, charge = 'PEN', total
        if command.payment_method == 'paypal' and config['mode'] != 'demo':
            currency, charge = 'USD', converted_total(total, self.payments.usd_rate())
        order = self.repository.create(owner, command, digest, config['mode'], total, charge, currency, lines)
        return self.serialize(order)

    def get(self, order_id, owner):
        return self.serialize(self.owned_order(order_id, owner))

    def pay(self, order_id, owner):
        order = self.owned_order(order_id, owner)
        if order['payment_mode'] != self.payments.mode():
            raise Conflict('Este pedido pertenece a otro entorno de pagos')
        if order['status'] != 'pending' or order['payment_mode'] == 'demo':
            return {'url': f'/pedido/{order_id}'}
        if order['checkout_url']:
            return {'url': order['checkout_url']}
        reference, url = self.payments.start(order)
        self.repository.save_checkout(order_id, reference, url)
        return {'url': url}

    def settle(self, order, capture=False):
        if order['status'] != 'pending' or order['payment_mode'] == 'demo':
            return
        payment_id = self.payments.verify(order, capture)
        if not payment_id:
            return
        status = 'paid' if order['payment_mode'] == 'live' else 'test_paid'
        self.repository.settle(order['id'], status, payment_id)
        order['status'] = status

    def confirm(self, order_id, owner):
        order = self.owned_order(order_id, owner)
        self.settle(order, capture=True)
        return self.serialize(order)

    def simulate(self, order_id, owner, outcome):
        order = self.owned_order(order_id, owner)
        if self.payments.mode() != 'demo' or order['payment_mode'] != 'demo':
            raise Forbidden('La simulación solo está disponible en modo demo')
        if outcome not in ('approved', 'declined', 'cancelled'):
            raise InvalidInput('Resultado de simulación inválido')
        if order['status'] == 'pending' and outcome != 'declined':
            order['status'] = 'simulated' if outcome == 'approved' else 'cancelled'
            self.repository.set_status(order_id, order['status'])
        result = self.serialize(order)
        if outcome == 'declined' and order['status'] == 'pending':
            result['message'] = 'Pago rechazado de prueba. Puedes volver a intentarlo.'
        return result

    def reconcile(self):
        rows = self.repository.pending(self.payments.mode())
        for order in rows:
            self.settle(order, capture=True)
        return {'checked': len(rows)}
