import OrderPayment from '../../components/OrderPayment'

// oxlint-disable-next-line react/only-export-components -- Next.js metadata.
export const metadata = { title: 'Tu pedido | Julia' }

export default async function OrderPage({ params }) {
  const { id } = await params
  return <OrderPayment id={id} />
}
