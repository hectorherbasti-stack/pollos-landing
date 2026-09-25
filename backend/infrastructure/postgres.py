"""Repositorios ligados a una conexión/transacción administrada por la composición."""
from infrastructure import queries


class PostgresCatalog:
    def __init__(self, connection):
        self.connection = connection

    def list_active(self):
        return self.connection.execute(queries.PRODUCTS).fetchall()


class PostgresSales:
    def __init__(self, connection):
        self.connection = connection

    def dashboard(self):
        return {
            'totals': self.connection.execute(queries.TOTALS).fetchone(),
            'byProduct': self.connection.execute(queries.BY_PRODUCT).fetchall(),
            'recentSales': self.connection.execute(queries.RECENT_SALES).fetchall(),
        }

    def record(self, product_id, quantity):
        row = self.connection.execute(queries.INSERT_SALE, (quantity, product_id)).fetchone()
        return row['id'] if row else None


class PostgresOrders:
    def __init__(self, connection):
        self.connection = connection

    def find_request(self, owner, request_key):
        self.connection.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', (f'{owner}:{request_key}',))
        return self.connection.execute(
            'SELECT * FROM checkout_orders WHERE owner_id = %s AND request_key = %s',
            (owner, request_key)).fetchone()

    def active_products(self, ids):
        return self.connection.execute(
            'SELECT * FROM products WHERE id = ANY(%s) AND active = TRUE ORDER BY id FOR SHARE',
            (ids,)).fetchall()

    def create(self, owner, command, digest, mode, total, charge, currency, lines):
        order = self.connection.execute('''INSERT INTO checkout_orders (owner_id, request_key, request_hash,
            customer_name, customer_email, customer_phone, payment_method, payment_mode,
            total_cents, charge_cents, charge_currency)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''', (
                owner, command.request_key, digest, command.customer.name, command.customer.email,
                command.customer.phone, command.payment_method, mode, total, charge, currency)).fetchone()
        for row, quantity, line_total in lines:
            self.connection.execute('''INSERT INTO checkout_items (order_id, product_id, name, quantity,
                unit_price_cents, unit_cost_cents, total_cents) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (order['id'], row['id'], row['name'], quantity, row['sale_price_cents'], row['cost_price_cents'], line_total))
        return order

    def get_owned(self, order_id, owner):
        return self.connection.execute(
            'SELECT * FROM checkout_orders WHERE id = %s AND owner_id = %s FOR UPDATE',
            (order_id, owner)).fetchone()

    def items(self, order_id):
        return self.connection.execute('''SELECT product_id AS "productId", name, quantity,
            unit_price_cents AS "unitPriceCents", total_cents AS "totalCents"
            FROM checkout_items WHERE order_id = %s ORDER BY product_id''', (order_id,)).fetchall()

    def save_checkout(self, order_id, reference, url):
        self.connection.execute(
            'UPDATE checkout_orders SET provider_reference = %s, checkout_url = %s WHERE id = %s',
            (reference, url, order_id))

    def set_status(self, order_id, status):
        self.connection.execute('UPDATE checkout_orders SET status = %s WHERE id = %s', (status, order_id))

    def settle(self, order_id, status, payment_id):
        self.connection.execute('UPDATE checkout_orders SET status = %s, payment_id = %s WHERE id = %s',
                                (status, payment_id, order_id))
        if status == 'paid':
            self.connection.execute('''INSERT INTO sales (product_id, quantity, unit_price_cents, unit_cost_cents, checkout_item_id)
                SELECT product_id, quantity, unit_price_cents, unit_cost_cents, id
                FROM checkout_items WHERE order_id = %s ON CONFLICT (checkout_item_id) DO NOTHING''', (order_id,))

    def pending(self, mode):
        return self.connection.execute('''SELECT * FROM checkout_orders WHERE status = 'pending'
            AND provider_reference IS NOT NULL AND payment_mode = %s
            ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED''', (mode,)).fetchall()
