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
