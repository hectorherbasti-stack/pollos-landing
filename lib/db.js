import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const databaseDirectory = path.join(process.cwd(), 'data')
const databasePath = path.join(databaseDirectory, 'julia.sqlite')

function createDatabase() {
  fs.mkdirSync(databaseDirectory, { recursive: true })
  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🍗',
      sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
      cost_price_cents INTEGER NOT NULL CHECK (cost_price_cents >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
      sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const productCount = database.prepare('SELECT COUNT(*) AS count FROM products').get().count
  if (productCount === 0) {
    const insert = database.prepare(`
      INSERT INTO products (name, description, emoji, sale_price_cents, cost_price_cents)
      VALUES (@name, @description, @emoji, @salePrice, @costPrice)
    `)
    const seedProducts = [
      { name: 'Pollo entero', description: 'Pollo fresco, ideal para horno o parrilla.', emoji: '🐔', salePrice: 1450, costPrice: 1050 },
      { name: 'Pollo trozado', description: 'Presas a elección, preparadas en el momento.', emoji: '🍗', salePrice: 1650, costPrice: 1180 },
      { name: 'Milanesas de pollo', description: 'Filetes limpios y listos para cocinar.', emoji: '🍽️', salePrice: 2200, costPrice: 1550 },
      { name: 'Menudencias', description: 'Mollejas, hígados y corazones frescos.', emoji: '🥘', salePrice: 850, costPrice: 510 },
    ]
    const seed = database.transaction((items) => items.forEach((item) => insert.run(item)))
    seed(seedProducts)
  }

  return database
}

const globalDatabase = globalThis
export const db = globalDatabase.__juliaDatabase ?? createDatabase()
if (process.env.NODE_ENV !== 'production') globalDatabase.__juliaDatabase = db

export function getProducts() {
  return db.prepare(`
    SELECT id, name, description, emoji,
      sale_price_cents AS salePriceCents,
      cost_price_cents AS costPriceCents
    FROM products WHERE active = 1 ORDER BY id
  `).all()
}

export function getDashboard() {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(quantity), 0) AS units,
      COALESCE(SUM(quantity * unit_price_cents), 0) AS revenueCents,
      COALESCE(SUM(quantity * unit_cost_cents), 0) AS costCents,
      COALESCE(SUM(quantity * (unit_price_cents - unit_cost_cents)), 0) AS profitCents
    FROM sales
  `).get()

  const byProduct = db.prepare(`
    SELECT p.name, p.emoji, COALESCE(SUM(s.quantity), 0) AS units,
      COALESCE(SUM(s.quantity * s.unit_price_cents), 0) AS revenueCents,
      COALESCE(SUM(s.quantity * (s.unit_price_cents - s.unit_cost_cents)), 0) AS profitCents
    FROM products p LEFT JOIN sales s ON s.product_id = p.id
    GROUP BY p.id ORDER BY revenueCents DESC
  `).all()

  const recentSales = db.prepare(`
    SELECT s.id, p.name, p.emoji, s.quantity,
      s.quantity * s.unit_price_cents AS totalCents,
      s.quantity * (s.unit_price_cents - s.unit_cost_cents) AS profitCents,
      s.sold_at AS soldAt
    FROM sales s JOIN products p ON p.id = s.product_id
    ORDER BY s.id DESC LIMIT 12
  `).all()

  return { totals, byProduct, recentSales }
}

export function recordSale(productId, quantity) {
  const product = db.prepare(`
    SELECT id, sale_price_cents AS salePriceCents, cost_price_cents AS costPriceCents
    FROM products WHERE id = ? AND active = 1
  `).get(productId)
  if (!product) throw new Error('Producto no encontrado')

  db.prepare(`
    INSERT INTO sales (product_id, quantity, unit_price_cents, unit_cost_cents)
    VALUES (?, ?, ?, ?)
  `).run(product.id, quantity, product.salePriceCents, product.costPriceCents)
}
