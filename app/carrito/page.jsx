import { getProducts } from '../../lib/backend'
import CartCheckout from '../components/CartCheckout'

export const dynamic = 'force-dynamic'
// oxlint-disable-next-line react/only-export-components -- Next.js metadata.
export const metadata = { title: 'Tu carrito | Julia' }

export default async function CartPage() {
  const products = await getProducts()
  return <CartCheckout products={products.map(({ id, name, emoji, salePriceCents }) => ({ id, name, emoji, salePriceCents }))} />
}
