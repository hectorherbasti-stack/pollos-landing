export function createHttpStore({ baseUrl, apiKey, fetcher = fetch }) {
  async function request(path, { privateRoute = false, ...options } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (privateRoute) {
      if (!apiKey) throw new Error('Falta BACKEND_API_KEY')
      headers.Authorization = `Bearer ${apiKey}`
    }
    const response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`El backend respondió ${response.status}`)
    return response.json()
  }

  return {
    getProducts: () => request('/products'),
    getDashboard: () => request('/dashboard', { privateRoute: true }),
    recordSale: (productId, quantity) => request('/sales', {
      privateRoute: true, method: 'POST', body: JSON.stringify({ productId, quantity }),
    }),
  }
}
