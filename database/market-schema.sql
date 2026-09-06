BEGIN;

CREATE TABLE IF NOT EXISTS markets (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  district TEXT,
  city TEXT NOT NULL DEFAULT 'Lima',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stalls (
  id BIGSERIAL PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, code)
);

CREATE TABLE IF NOT EXISTS product_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Catálogo general. Un mismo producto puede estar disponible en varios puestos.
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT REFERENCES product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sku TEXT UNIQUE,
  emoji TEXT,
  image_url TEXT,
  measurement_unit TEXT NOT NULL DEFAULT 'kg'
    CHECK (measurement_unit IN ('kg', 'unit', 'pack', 'liter')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Oferta del puesto: precio, costo y stock pueden variar por puesto.
CREATE TABLE IF NOT EXISTS stall_products (
  id BIGSERIAL PRIMARY KEY,
  stall_id BIGINT NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
  cost_price_cents INTEGER NOT NULL CHECK (cost_price_cents >= 0),
  current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_stock NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stall_id, product_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (phone)
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  stall_id BIGINT NOT NULL REFERENCES stalls(id) ON DELETE RESTRICT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
  channel TEXT NOT NULL DEFAULT 'counter'
    CHECK (channel IN ('counter', 'whatsapp', 'delivery')),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  total_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  notes TEXT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents)
);

-- Conserva nombre, unidad, precio y costo históricos aunque el producto cambie.
CREATE TABLE IF NOT EXISTS sale_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  stall_product_id BIGINT NOT NULL REFERENCES stall_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  measurement_unit TEXT NOT NULL,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method_id BIGINT NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kardex: entradas, ventas, ajustes, mermas y devoluciones.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  stall_product_id BIGINT NOT NULL REFERENCES stall_products(id) ON DELETE RESTRICT,
  sale_item_id BIGINT REFERENCES sale_items(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'waste', 'return')),
  quantity_delta NUMERIC(12, 3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_cents INTEGER CHECK (unit_cost_cents >= 0),
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stalls_market_id_idx ON stalls(market_id);
CREATE INDEX IF NOT EXISTS stall_products_stall_id_idx ON stall_products(stall_id);
CREATE INDEX IF NOT EXISTS stall_products_product_id_idx ON stall_products(product_id);
CREATE INDEX IF NOT EXISTS sales_stall_sold_at_idx ON sales(stall_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS inventory_movements_product_date_idx ON inventory_movements(stall_product_id, occurred_at DESC);

INSERT INTO payment_methods (name) VALUES ('Efectivo'), ('Yape'), ('Plin'), ('Tarjeta'), ('Transferencia')
ON CONFLICT (name) DO NOTHING;

COMMIT;
