// Importamos Pool desde pg. Un pool reutiliza conexiones y evita abrir una nueva
// conexión TCP con PostgreSQL en cada visita a la página.
import { Pool } from 'pg'

// globalThis sobrevive a las recargas de desarrollo de Next.js.
// Sin esta caché, cada recarga abriría otro conjunto de conexiones PostgreSQL.
const globalDatabase = globalThis

export function getPool() {
  // DATABASE_URL es obligatoria y solo debe existir en el entorno del servidor.
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL. Copia .env.example a .env.local y agrega la conexión de PostgreSQL.')
  }
  // Creamos como máximo un pool por proceso de Node.js.
  if (!globalDatabase.__juliaPostgresPool) {
    // max limita conexiones; los timeouts liberan o cancelan conexiones bloqueadas.
    globalDatabase.__juliaPostgresPool = new Pool({
      // URL completa: protocolo, usuario, contraseña, host, puerto y base.
      connectionString: process.env.DATABASE_URL,
      // Nunca mantendremos más de diez conexiones simultáneas por proceso.
      max: 10,
      // Una conexión sin uso se cierra después de treinta segundos.
      idleTimeoutMillis: 30_000,
      // Si conectar tarda más de diez segundos, pg devuelve un error.
      connectionTimeoutMillis: 10_000,
    })
  }
  // Entregamos el mismo pool a Auth.js y a las funciones comerciales.
  return globalDatabase.__juliaPostgresPool
}

// Esta variable guardará la Promise, no el resultado final. Así dos peticiones que
// llegan juntas no intentan crear las mismas tablas simultáneamente.
let initialization

export async function ensureDatabase() {
  // Todas las llamadas simultáneas esperan la misma Promise de inicialización.
  if (initialization) return initialization
  initialization = (async () => {
    const pool = getPool()
    // DDL idempotente: IF NOT EXISTS permite ejecutar el bloque varias veces.
    // products/sales pertenecen al negocio; users/accounts/sessions a Auth.js.
    await pool.query(`
      -- Tabla maestra del catálogo que se muestra en la portada.
      CREATE TABLE IF NOT EXISTS products (
        -- BIGSERIAL genera automáticamente ids enteros crecientes.
        id BIGSERIAL PRIMARY KEY,
        -- NOT NULL obliga a que estos datos siempre estén presentes.
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '🍗',
        -- Guardamos dinero en céntimos: 1450 equivale a S/ 14.50.
        sale_price_cents INTEGER NOT NULL CHECK (sale_price_cents >= 0),
        cost_price_cents INTEGER NOT NULL CHECK (cost_price_cents >= 0),
        -- Desactivar oculta el producto sin borrar su historial.
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Cada fila representa una venta de un solo producto en el modelo actual.
      CREATE TABLE IF NOT EXISTS sales (
        id BIGSERIAL PRIMARY KEY,
        -- La clave foránea impide vender un producto que no existe.
        product_id BIGINT NOT NULL REFERENCES products(id),
        -- NUMERIC(10,2) admite, por ejemplo, 2.50 kg sin imprecisión binaria.
        quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
        -- Son copias históricas: no cambian al editar el producto en el futuro.
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
        sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      -- Los índices aceleran filtros/uniones por producto y listados por fecha.
      CREATE INDEX IF NOT EXISTS sales_product_id_idx ON sales(product_id);
      CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at DESC);

      -- Las cuatro tablas siguientes tienen los nombres exigidos por Auth.js.
      -- users representa a la persona que inició sesión con Google.
      CREATE TABLE IF NOT EXISTS users (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT, email TEXT UNIQUE, "emailVerified" TIMESTAMPTZ, image TEXT,
        role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner'))
      );
      -- accounts enlaza un usuario local con su identidad de Google.
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL, provider TEXT NOT NULL, "providerAccountId" TEXT NOT NULL,
        refresh_token TEXT, access_token TEXT, expires_at BIGINT, token_type TEXT,
        scope TEXT, id_token TEXT, session_state TEXT,
        UNIQUE(provider, "providerAccountId")
      );
      -- sessions guarda sesiones persistentes; sessionToken identifica el navegador.
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires TIMESTAMPTZ NOT NULL, "sessionToken" TEXT NOT NULL UNIQUE
      );
      -- verification_token permite flujos de verificación compatibles con Auth.js.
      CREATE TABLE IF NOT EXISTS verification_token (
        identifier TEXT NOT NULL, token TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (identifier, token)
      );
    `)
    // Solo insertamos los productos de ejemplo cuando la tabla está vacía.
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
  })().catch((error) => {
    // Si falla la conexión, permitimos que una petición posterior vuelva a intentar.
    initialization = undefined
    throw error
  })
  return initialization
}

// pg devuelve BIGINT y NUMERIC como texto para no perder precisión.
// En este proyecto los valores son pequeños, así que es seguro convertirlos a Number.
const numeric = (row, fields) => {
  for (const field of fields) row[field] = Number(row[field])
  return row
}

export async function getProducts() {
  // Aseguramos que la tabla exista antes del primer SELECT del proceso.
  await ensureDatabase()
  // Los alias entre comillas conservan camelCase para que JSX los use directamente.
  const { rows } = await getPool().query(`
    SELECT
      id,
      name,
      description,
      emoji,
      sale_price_cents AS "salePriceCents",
      cost_price_cents AS "costPriceCents"
    FROM products
    WHERE active = TRUE
    ORDER BY id
  `)
  // Convertimos los tipos numéricos de cada fila antes de entregarlos a React.
  return rows.map((row) => numeric(row, ['id', 'salePriceCents', 'costPriceCents']))
}

export async function getDashboard() {
  await ensureDatabase()
  const pool = getPool()
  // Estas tres consultas son independientes y se ejecutan en paralelo.
  const [totalsResult, byProductResult, recentSalesResult] = await Promise.all([
    // Consulta 1: una sola fila con los cuatro indicadores generales.
    pool.query(`
      SELECT
        COALESCE(SUM(quantity), 0) AS units,
        COALESCE(SUM(quantity * unit_price_cents), 0) AS "revenueCents",
        COALESCE(SUM(quantity * unit_cost_cents), 0) AS "costCents",
        COALESCE(SUM(quantity * (unit_price_cents - unit_cost_cents)), 0) AS "profitCents"
      FROM sales
    `),
    // Consulta 2: LEFT JOIN conserva productos que todavía no tienen ventas.
    pool.query(`
      SELECT
        p.name,
        p.emoji,
        COALESCE(SUM(s.quantity), 0) AS units,
        COALESCE(SUM(s.quantity * s.unit_price_cents), 0) AS "revenueCents",
        COALESCE(SUM(s.quantity * (s.unit_price_cents - s.unit_cost_cents)), 0) AS "profitCents"
      FROM products p
      LEFT JOIN sales s ON s.product_id = p.id
      GROUP BY p.id
      ORDER BY "revenueCents" DESC
    `),
    // Consulta 3: JOIN añade nombre/emoji y LIMIT evita una tabla demasiado larga.
    pool.query(`
      SELECT
        s.id,
        p.name,
        p.emoji,
        s.quantity,
        s.quantity * s.unit_price_cents AS "totalCents",
        s.quantity * (s.unit_price_cents - s.unit_cost_cents) AS "profitCents",
        s.sold_at AS "soldAt"
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ORDER BY s.id DESC
      LIMIT 12
    `),
  ])
  return {
    totals: numeric(totalsResult.rows[0], ['units', 'revenueCents', 'costCents', 'profitCents']),
    byProduct: byProductResult.rows.map((row) => numeric(row, ['units', 'revenueCents', 'profitCents'])),
    recentSales: recentSalesResult.rows.map((row) => numeric(row, ['id', 'quantity', 'totalCents', 'profitCents'])),
  }
}

export async function recordSale(productId, quantity) {
  await ensureDatabase()
  // INSERT ... SELECT copia el precio y costo actuales al registro histórico.
  // $1 y $2 son parámetros: evitan concatenar entrada y protegen contra SQL injection.
  const result = await getPool().query(
    `
      INSERT INTO sales (
        product_id,
        quantity,
        unit_price_cents,
        unit_cost_cents
      )
      SELECT
        id,
        $2,
        sale_price_cents,
        cost_price_cents
      FROM products
      WHERE id = $1 AND active = TRUE
      RETURNING id
    `,
    // El orden del arreglo corresponde a $1 y $2 dentro del SQL.
    [productId, quantity],
  )
  // Ninguna fila insertada significa producto inexistente o inactivo.
  if (result.rowCount !== 1) throw new Error('Producto no encontrado')
}
