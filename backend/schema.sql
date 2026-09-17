CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍗',
  sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
  cost_price_cents INTEGER NOT NULL CHECK (cost_price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_product_id_idx ON sales(product_id);
CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at DESC);


      INSERT INTO products (name, description, emoji, sale_price_cents, cost_price_cents)
      SELECT seed.name, seed.description, seed.emoji, seed.sale_price_cents, seed.cost_price_cents
      FROM (VALUES
        ('Pollo entero', 'Pollo fresco, ideal para horno o parrilla.', '🐔', 1450, 1050),
        ('Pollo trozado', 'Presas a elección, preparadas en el momento.', '🍗', 1650, 1180),
        ('Milanesas de pollo', 'Filetes limpios y listos para cocinar.', '🍽️', 2200, 1550),
        ('Menudencias', 'Mollejas, hígados y corazones frescos.', '🥘', 850, 510)
      ) AS seed(name, description, emoji, sale_price_cents, cost_price_cents)
      WHERE NOT EXISTS (SELECT 1 FROM products)
    ;

-- Pedidos del checkout: importes calculados por el servidor y precios históricos.
CREATE TABLE IF NOT EXISTS checkout_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  request_key UUID NOT NULL,
  request_hash TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('paypal', 'yape', 'visa')),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('demo', 'sandbox', 'live')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'simulated', 'test_paid', 'cancelled')),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  charge_cents INTEGER NOT NULL CHECK (charge_cents > 0),
  charge_currency TEXT NOT NULL CHECK (charge_currency IN ('PEN', 'USD')),
  provider_reference TEXT,
  payment_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_payment_idx ON checkout_orders(payment_method, payment_id)
  WHERE payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS checkout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES checkout_orders(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  UNIQUE(order_id, product_id)
);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS checkout_item_id UUID REFERENCES checkout_items(id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_checkout_item_idx ON sales(checkout_item_id);
