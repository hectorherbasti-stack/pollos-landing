import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const orderPath = new RegExp(`^orders/${uuid}$`)
const actionPath = new RegExp(`^orders/${uuid}/(pay|confirm|demo)$`)
const cookieName = 'julia_checkout_owner'

async function forward(request, context) {
  const { path } = await context.params
  const route = path.join('/')
  const allowed = request.method === 'GET' ? route === 'config' || orderPath.test(route)
    : route === 'orders' || actionPath.test(route)
  if (!allowed) return Response.json({ detail: 'Ruta no disponible' }, { status: 404 })
  if (!process.env.BACKEND_URL || !process.env.BACKEND_API_KEY) {
    return Response.json({ detail: 'Las compras online todavía no están habilitadas. Contacta con la tienda.' }, { status: 503 })
  }
  if (request.method === 'POST') {
    // Las cookies de propietario no bastan: comprobamos el origen de las mutaciones.
    const expected = new URL(process.env.CHECKOUT_PUBLIC_URL || process.env.AUTH_URL || request.url).origin
    if (request.headers.get('origin') !== expected) {
      return Response.json({ detail: 'Origen no autorizado' }, { status: 403 })
    }
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return Response.json({ detail: 'Se requiere JSON' }, { status: 415 })
    }
  }
  const store = await cookies()
  let owner = store.get(cookieName)?.value
  if (!owner || !new RegExp(`^${uuid}$`).test(owner)) {
    if (route !== 'orders') {
      if (route !== 'config') return Response.json({ detail: 'No hay una sesión de compra' }, { status: 404 })
    } else {
      owner = randomUUID()
      const publicUrl = process.env.CHECKOUT_PUBLIC_URL || process.env.AUTH_URL || request.url
      store.set(cookieName, owner, { httpOnly: true, sameSite: 'lax', secure: publicUrl.startsWith('https:'),
        path: '/', maxAge: 60 * 60 * 24 * 30 })
    }
  }
  try {
    const body = request.method === 'POST' ? await request.text() : undefined
    if (body && Buffer.byteLength(body) > 20000) return Response.json({ detail: 'Pedido demasiado grande' }, { status: 413 })
    const headers = { Authorization: `Bearer ${process.env.BACKEND_API_KEY}`, 'Content-Type': 'application/json' }
    if (owner) headers['X-Checkout-Owner'] = owner
    const endpoint = route === 'config' ? 'checkout/config' : route
    const response = await fetch(`${process.env.BACKEND_URL.replace(/\/$/, '')}/${endpoint}`, {
      method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(45000),
    })
    const result = await response.json()
    if (response.status === 422) return Response.json({ detail: 'Revisa tus datos y las cantidades del carrito.' }, { status: 422 })
    if (!response.ok) return Response.json({ detail: typeof result.detail === 'string' ? result.detail : 'No se pudo procesar el pedido.' }, { status: response.status })
    return Response.json(result, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ detail: 'No se pudo contactar con la tienda. Reintenta en unos momentos.' }, { status: 503 })
  }
}

export const GET = forward
export const POST = forward
