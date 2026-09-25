// Punto de composición del servidor web. Conserva la API usada por páginas y Actions.
import { createStore } from './application/store'
import { createHttpStore } from './infrastructure/httpStore'
import * as postgresStore from './infrastructure/postgresStore'
import { requirePanel } from './presentation/panelAccess'

function store() {
  const adapter = process.env.BACKEND_URL
    ? createHttpStore({ baseUrl: process.env.BACKEND_URL, apiKey: process.env.BACKEND_API_KEY })
    : postgresStore
  return createStore({ catalog: adapter, sales: adapter, authorize: requirePanel })
}

export async function getProducts() { return store().getProducts() }
export async function getDashboard() { return store().getDashboard() }
export async function recordSale(productId, quantity) { return store().recordSale(productId, quantity) }
