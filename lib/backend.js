// Solo se importa desde páginas del servidor y Server Actions.
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PANEL_COOKIE, hashPassword } from './panelAuth'
import * as localDatabase from './db'

async function requirePanel() {
  const password = process.env.PANEL_PASSWORD
  const cookie = (await cookies()).get(PANEL_COOKIE)?.value
  if (!password || cookie !== await hashPassword(password)) redirect('/panel/login')
}

async function request(path, { privateRoute = false, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (privateRoute) {
    if (!process.env.BACKEND_API_KEY) throw new Error('Falta BACKEND_API_KEY')
    headers.Authorization = `Bearer ${process.env.BACKEND_API_KEY}`
  }
  const response = await fetch(`${process.env.BACKEND_URL.replace(/\/$/, '')}${path}`, {
    ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`El backend respondió ${response.status}`)
  return response.json()
}

export async function getProducts() {
  return process.env.BACKEND_URL ? request('/products') : localDatabase.getProducts()
}

export async function getDashboard() {
  await requirePanel()
  return process.env.BACKEND_URL
    ? request('/dashboard', { privateRoute: true })
    : localDatabase.getDashboard()
}

export async function recordSale(productId, quantity) {
  await requirePanel()
  return process.env.BACKEND_URL
    ? request('/sales', { privateRoute: true, method: 'POST', body: JSON.stringify({ productId, quantity }) })
    : localDatabase.recordSale(productId, quantity)
}
