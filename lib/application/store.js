/**
 * Puertos estructurales del servidor web. Los adaptadores no conocen Next.js.
 * @typedef {{getProducts: () => Promise<Array<object>>}} CatalogPort
 * @typedef {{getDashboard: () => Promise<object>, recordSale: (productId: number, quantity: number) => Promise<unknown>}} SalesPort
 */

/** @param {{catalog: CatalogPort, sales: SalesPort, authorize: () => Promise<void>}} dependencies */
export function createStore({ catalog, sales, authorize }) {
  return {
    async getProducts() {
      const products = await catalog.getProducts()
      return products.map(({ id, name, description, emoji, salePriceCents }) => ({
        id, name, description, emoji, salePriceCents,
      }))
    },
    async getDashboard() {
      await authorize()
      return sales.getDashboard()
    },
    async recordSale(productId, quantity) {
      await authorize()
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isFinite(quantity)
        || quantity <= 0 || quantity > 1000 || Number(quantity.toFixed(2)) !== quantity) {
        throw new Error('Revisa el producto y la cantidad')
      }
      return sales.recordSale(productId, quantity)
    },
  }
}
