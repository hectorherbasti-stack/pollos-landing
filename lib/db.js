import { Pool } from 'pg'

const globalDatabase = globalThis

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Copia .env.example a .env.local y agrega la conexión de PostgreSQL.')
  }
  if (!globalDatabase.__juliaPostgresPool) {
    globalDatabase.__juliaPostgresPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
  }
  return globalDatabase.__juliaPostgresPool
}

let initialization

async function ensureDatabase() {
  if (initialization) return initialization
  initialization = (async () => {
    const pool = getPool()
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '🍗', sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
        cost_price_cents INTEGER NOT NULL CHECK (cost_price_cents >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sales (
        id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id),
        quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0), unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0), sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS sales_product_id_idx ON sales(product_id);
      CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at DESC);
    `)
    await pool.query(`
      INSERT INTO products (name, description, emoji, sale_price_cents, cost_price_cents)
      SELECT seed.name, seed.description, seed.emoji, seed.sale_price_cents, seed.cost_price_cents
      FROM (VALUES
        ('Pollo entero', 'Pollo fresco, ideal para horno o parrilla.', '🐔', 1450, 1050),
        ('Pollo trozado', 'Presas a elección, preparadas en el momento.', '🍗', 1650, 1180),
        ('Milanesas de pollo', 'Filetes limpios y listos para cocinar.', '🍽️', 2200, 1550),
        ('Menudencias', 'Mollejas, hígados y corazones frescos.', '🥘', 850, 510)
      ) AS seed(name, description, emoji, sale_price_cents, cost_price_cents)
      WHERE NOT EXISTS (SELECT 1 FROM products)
    `)
  })().catch((error) => { initialization = undefined; throw error })
  return initialization
}

const numeric = (row, fields) => { for (const field of fields) row[field] = Number(row[field]); return row }

export async function getProducts() {
  await ensureDatabase()
  const { rows } = await getPool().query(`SELECT id, name, description, emoji, sale_price_cents AS "salePriceCents", cost_price_cents AS "costPriceCents" FROM products WHERE active = TRUE ORDER BY id`)
  return rows.map((row) => numeric(row, ['id', 'salePriceCents', 'costPriceCents']))
}

export async function getDashboard() {
  await ensureDatabase()
  const pool = getPool()
  const [totalsResult, byProductResult, recentSalesResult] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(quantity), 0) AS units, COALESCE(SUM(quantity * unit_price_cents), 0) AS "revenueCents", COALESCE(SUM(quantity * unit_cost_cents), 0) AS "costCents", COALESCE(SUM(quantity * (unit_price_cents - unit_cost_cents)), 0) AS "profitCents" FROM sales`),
    pool.query(`SELECT p.name, p.emoji, COALESCE(SUM(s.quantity), 0) AS units, COALESCE(SUM(s.quantity * s.unit_price_cents), 0) AS "revenueCents", COALESCE(SUM(s.quantity * (s.unit_price_cents - s.unit_cost_cents)), 0) AS "profitCents" FROM products p LEFT JOIN sales s ON s.product_id = p.id GROUP BY p.id ORDER BY "revenueCents" DESC`),
    pool.query(`SELECT s.id, p.name, p.emoji, s.quantity, s.quantity * s.unit_price_cents AS "totalCents", s.quantity * (s.unit_price_cents - s.unit_cost_cents) AS "profitCents", s.sold_at AS "soldAt" FROM sales s JOIN products p ON p.id = s.product_id ORDER BY s.id DESC LIMIT 12`),
  ])
  return {
    totals: numeric(totalsResult.rows[0], ['units', 'revenueCents', 'costCents', 'profitCents']),
    byProduct: byProductResult.rows.map((row) => numeric(row, ['units', 'revenueCents', 'profitCents'])),
    recentSales: recentSalesResult.rows.map((row) => numeric(row, ['id', 'quantity', 'totalCents', 'profitCents'])),
  }
}

export async function recordSale(productId, quantity) {
  await ensureDatabase()
  const result = await getPool().query(`INSERT INTO sales (product_id, quantity, unit_price_cents, unit_cost_cents) SELECT id, $2, sale_price_cents, cost_price_cents FROM products WHERE id = $1 AND active = TRUE RETURNING id`, [productId, quantity])
  if (result.rowCount !== 1) throw new Error('Producto no encontrado')
}
