import assert from 'node:assert/strict'
import test from 'node:test'
import { createStore } from '../lib/application/store.js'
import { createHttpStore } from '../lib/infrastructure/httpStore.js'

test('el catálogo público excluye costos con cualquier adaptador', async () => {
  const catalog = { getProducts: async () => [{ id: 1, name: 'Pollo', salePriceCents: 1450, costPriceCents: 1050 }] }
  const store = createStore({ catalog, sales: {}, authorize: async () => { throw new Error('Privado') } })
  const [product] = await store.getProducts()
  assert.equal(product.salePriceCents, 1450)
  assert.equal('costPriceCents' in product, false)
})

test('autoriza antes de consultar el panel o registrar ventas', async () => {
  let accesses = 0
  const sales = { getDashboard: async () => { accesses++ }, recordSale: async () => { accesses++ } }
  const store = createStore({ catalog: {}, sales, authorize: async () => { throw new Error('Sin sesión') } })
  await assert.rejects(store.getDashboard(), /Sin sesión/)
  await assert.rejects(store.recordSale(1, 2.5), /Sin sesión/)
  assert.equal(accesses, 0)
})

test('las cantidades inválidas no llegan al adaptador', async () => {
  const calls = []
  const sales = { recordSale: async (...args) => { calls.push(args); return { id: 9 } } }
  const store = createStore({ catalog: {}, sales, authorize: async () => {} })
  for (const quantity of [0, -1, 1001, 0.001, NaN, Infinity]) {
    await assert.rejects(store.recordSale(1, quantity), /Revisa/)
  }
  assert.deepEqual(calls, [])
  assert.deepEqual(await store.recordSale(1, 2.5), { id: 9 })
  assert.deepEqual(calls, [[1, 2.5]])
})

test('el adaptador HTTP conserva rutas, credenciales privadas e importes', async () => {
  const calls = []
  const adapter = createHttpStore({ baseUrl: 'https://api.example/', apiKey: 'test-token',
    fetcher: async (url, options) => {
      calls.push({ url, ...options })
      return { ok: true, json: async () => ({ id: 1 }) }
    },
  })
  await adapter.getProducts()
  await adapter.getDashboard()
  await adapter.recordSale(1, 2.5)
  assert.deepEqual(calls.map(call => call.url), [
    'https://api.example/products', 'https://api.example/dashboard', 'https://api.example/sales',
  ])
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(calls[1].headers.Authorization, 'Bearer test-token')
  assert.equal(calls[2].headers.Authorization, 'Bearer test-token')
  assert.equal(calls[2].method, 'POST')
  assert.deepEqual(JSON.parse(calls[2].body), { productId: 1, quantity: 2.5 })
})

test('el adaptador HTTP propaga fallos y exige clave en operaciones privadas', async () => {
  const adapter = createHttpStore({ baseUrl: 'https://api.example',
    fetcher: async () => ({ ok: false, status: 503 }),
  })
  await assert.rejects(adapter.getProducts(), /503/)
  await assert.rejects(adapter.getDashboard(), /Falta BACKEND_API_KEY/)
})
