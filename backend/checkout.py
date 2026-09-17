"""Pedidos con propiedad, idempotencia e importes calculados en PostgreSQL/Python."""
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
import payments


class Line(BaseModel):
    model_config = ConfigDict(extra='forbid')
    productId: Annotated[int, Field(strict=True, gt=0, le=9223372036854775807)]
    quantity: Annotated[Decimal, Field(gt=0, le=1000, decimal_places=2, allow_inf_nan=False)]


class Customer(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=2, max_length=100)]
    email: Annotated[str, Field(max_length=200, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')]
    phone: Annotated[str, Field(pattern=r'^\+?[0-9 ()-]{7,20}$')]


class NewOrder(BaseModel):
    model_config = ConfigDict(extra='forbid')
    requestKey: UUID
    items: Annotated[list[Line], Field(min_length=1, max_length=50)]
    customer: Customer
    paymentMethod: Literal['paypal', 'yape', 'visa']


class DemoResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    outcome: Literal['approved', 'declined', 'cancelled']


def serialize(conn, order):
    items = conn.execute('''SELECT product_id AS "productId", name, quantity,
        unit_price_cents AS "unitPriceCents", total_cents AS "totalCents"
        FROM checkout_items WHERE order_id = %s ORDER BY product_id''', (order['id'],)).fetchall()
    return {'id': str(order['id']), 'status': order['status'], 'mode': order['payment_mode'],
            'paymentMethod': order['payment_method'], 'totalCents': order['total_cents'],
            'chargeCents': order['charge_cents'], 'chargeCurrency': order['charge_currency'],
            'items': items, 'createdAt': order['created_at']}


def owned_order(conn, order_id, owner):
    order = conn.execute('SELECT * FROM checkout_orders WHERE id = %s AND owner_id = %s FOR UPDATE', (order_id, owner)).fetchone()
    if not order:
        raise HTTPException(404, 'Pedido no encontrado en esta sesión')
    return order


def settle(conn, order, capture=False):
    if order['status'] != 'pending' or order['payment_mode'] == 'demo':
        return
    payment_id = payments.verify(order, capture)
    if not payment_id:
        return
    status = 'paid' if order['payment_mode'] == 'live' else 'test_paid'
    conn.execute('UPDATE checkout_orders SET status = %s, payment_id = %s WHERE id = %s', (status, payment_id, order['id']))
    if status == 'paid':
        conn.execute('''INSERT INTO sales (product_id, quantity, unit_price_cents, unit_cost_cents, checkout_item_id)
            SELECT product_id, quantity, unit_price_cents, unit_cost_cents, id
            FROM checkout_items WHERE order_id = %s ON CONFLICT (checkout_item_id) DO NOTHING''', (order['id'],))
    order['status'] = status


def create_router(connection, require_admin):
    router = APIRouter(dependencies=[Depends(require_admin)])
    Database = Annotated[object, Depends(connection)]
    Owner = Annotated[UUID, Header(alias='X-Checkout-Owner')]

    @router.get('/checkout/config')
    def config():
        return payments.configuration()

    @router.post('/orders', status_code=201)
    def new_order(body: NewOrder, conn: Database, owner: Owner):
        digest = sha256(body.model_dump_json().encode()).hexdigest()
        # El bloqueo se mantiene hasta commit, incluso con solicitudes concurrentes.
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (f'{owner}:{body.requestKey}',))
        existing = conn.execute('SELECT * FROM checkout_orders WHERE owner_id = %s AND request_key = %s', (owner, body.requestKey)).fetchone()
        if existing:
            if existing['request_hash'] != digest:
                raise HTTPException(409, 'La solicitud ya existe con otro contenido')
            return serialize(conn, existing)
        config = payments.configuration()
        if not next(method['available'] for method in config['methods'] if method['id'] == body.paymentMethod):
            raise HTTPException(503, 'Este método de pago todavía no está configurado')
        ids = [line.productId for line in body.items]
        if len(set(ids)) != len(ids):
            raise HTTPException(422, 'Agrupa las cantidades de cada producto en una sola línea')
        rows = conn.execute('SELECT * FROM products WHERE id = ANY(%s) AND active = TRUE ORDER BY id FOR SHARE', (ids,)).fetchall()
        if len(rows) != len(ids):
            raise HTTPException(409, 'Un producto ya no está disponible. Actualiza el carrito.')
        quantities = {line.productId: line.quantity for line in body.items}
        lines = [(row, quantities[row['id']], int((row['sale_price_cents'] * quantities[row['id']]).quantize(Decimal('1'), rounding=ROUND_HALF_UP))) for row in rows]
        total = sum(line[2] for line in lines)
        if total <= 0 or total > 100000000:
            raise HTTPException(422, 'El importe del pedido está fuera del límite permitido')
        currency, charge = 'PEN', total
        if body.paymentMethod == 'paypal' and config['mode'] != 'demo':
            currency, charge = 'USD', int((total * payments.usd_rate()).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            if charge < 1:
                raise HTTPException(422, 'El importe convertido es demasiado pequeño')
        order = conn.execute('''INSERT INTO checkout_orders (owner_id, request_key, request_hash,
            customer_name, customer_email, customer_phone, payment_method, payment_mode,
            total_cents, charge_cents, charge_currency)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''', (
                owner, body.requestKey, digest, body.customer.name, body.customer.email, body.customer.phone,
                body.paymentMethod, config['mode'], total, charge, currency)).fetchone()
        for row, quantity, line_total in lines:
            conn.execute('''INSERT INTO checkout_items (order_id, product_id, name, quantity,
                unit_price_cents, unit_cost_cents, total_cents) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (order['id'], row['id'], row['name'], quantity, row['sale_price_cents'], row['cost_price_cents'], line_total))
        return serialize(conn, order)

    @router.get('/orders/{order_id}')
    def get_order(order_id: UUID, conn: Database, owner: Owner):
        return serialize(conn, owned_order(conn, order_id, owner))

    @router.post('/orders/{order_id}/pay')
    def pay(order_id: UUID, conn: Database, owner: Owner):
        order = owned_order(conn, order_id, owner)
        if order['payment_mode'] != payments.mode():
            raise HTTPException(409, 'Este pedido pertenece a otro entorno de pagos')
        if order['status'] != 'pending' or order['payment_mode'] == 'demo':
            return {'url': f'/pedido/{order_id}'}
        if order['checkout_url']:
            return {'url': order['checkout_url']}
        reference, url = payments.start(order)
        conn.execute('UPDATE checkout_orders SET provider_reference = %s, checkout_url = %s WHERE id = %s', (reference, url, order_id))
        return {'url': url}

    @router.post('/orders/{order_id}/confirm')
    def confirm(order_id: UUID, conn: Database, owner: Owner):
        order = owned_order(conn, order_id, owner)
        settle(conn, order, capture=True)
        return serialize(conn, order)

    @router.post('/orders/{order_id}/demo')
    def simulate(order_id: UUID, body: DemoResult, conn: Database, owner: Owner):
        order = owned_order(conn, order_id, owner)
        if payments.mode() != 'demo' or order['payment_mode'] != 'demo':
            raise HTTPException(403, 'La simulación solo está disponible en modo demo')
        if order['status'] == 'pending' and body.outcome != 'declined':
            order['status'] = 'simulated' if body.outcome == 'approved' else 'cancelled'
            conn.execute('UPDATE checkout_orders SET status = %s WHERE id = %s', (order['status'], order_id))
        result = serialize(conn, order)
        if body.outcome == 'declined' and order['status'] == 'pending':
            result['message'] = 'Pago rechazado de prueba. Puedes volver a intentarlo.'
        return result

    # Para reconciliar pagos si el comprador cierra el navegador antes de regresar.
    # Un trabajo programado del servidor puede invocarlo usando BACKEND_API_KEY.
    @router.post('/checkout/reconcile')
    def reconcile(conn: Database):
        rows = conn.execute('''SELECT * FROM checkout_orders WHERE status = 'pending'
            AND provider_reference IS NOT NULL AND payment_mode = %s
            ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED''', (payments.mode(),)).fetchall()
        for order in rows:
            settle(conn, order, capture=True)
        return {'checked': len(rows)}

    return router
