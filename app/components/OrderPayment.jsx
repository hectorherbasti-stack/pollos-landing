'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCart } from './CartProvider'

const money = (cents, currency = 'PEN') => new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(cents / 100)
const names = { paypal: 'PayPal', yape: 'Yape', visa: 'Visa' }

export default function OrderPayment({ id }) {
  const router = useRouter()
  const { update } = useCart()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)

  useEffect(() => {
    fetch(`/api/checkout/orders/${id}`).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail)
      setOrder(result)
    }).catch(cause => setError(cause.message || 'No se pudo cargar el pedido.'))
  }, [id])

  const completed = order && ['paid', 'simulated', 'test_paid'].includes(order.status)

  async function action(name, data = {}) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/checkout/orders/${id}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail)
      if (result.url) { window.location.assign(result.url); return }
      setOrder(result)
      setMessage(result.message || (result.status === 'pending' ? 'El pago todavía no está confirmado. Si ya pagaste, espera un momento y vuelve a verificar.' : ''))
    } catch (cause) { setError(cause.message || 'No se pudo procesar el pago.') }
    setBusy(false)
    lock.current = false
  }

  function finish() {
    for (const item of order.items) update(item.productId, 0)
    try { sessionStorage.removeItem('julia-checkout-attempt') } catch { /* Memoria. */ }
    router.push('/')
  }

  return <>
    <header className="site-header"><Link href="/" className="brand"><span>J</span> Julia</Link><Link className="text-link" href="/carrito">Volver al carrito</Link></header>
    <main className="order-page">
      <p className="eyebrow">TU PEDIDO EN JULIA</p>
      <h1>{completed ? '¡Todo listo!' : order?.status === 'cancelled' ? 'Pago cancelado.' : 'Un último paso.'}</h1>
      {error && <p role="alert" className="form-message error">{error}</p>}
      {!order && !error && <p role="status">Cargando pedido…</p>}
      {order && <section className="order-card">
        <div className="order-reference"><span>Pedido</span><strong>{order.id.slice(0, 8).toUpperCase()}</strong></div>
        {order.mode !== 'live' && <div className="payment-notice">{order.mode === 'demo' ? 'Demostración local · Sin cobros ni pedido real.' : 'Compra de prueba · No se contabiliza como venta real.'}</div>}
        {completed && <p className="order-success" role="status">{order.status === 'paid' ? 'Pago confirmado. Tu pedido está registrado para recojo en tienda.' : 'Prueba completada. No se ha registrado una venta real.'}</p>}
        {order.items.map(item => <div className="order-line" key={item.productId}><span>{item.name}<small>{Number(item.quantity)} kg × {money(item.unitPriceCents)}</small></span><strong>{money(item.totalCents)}</strong></div>)}
        <div className="checkout-total"><span>Total del pedido</span><strong>{money(order.totalCents)}</strong></div>
        <p className="order-method">Método elegido: <strong>{names[order.paymentMethod]}</strong></p>
        {order.chargeCurrency === 'USD' && <div className="payment-notice">Importe a pagar en PayPal: <strong>{money(order.chargeCents, 'USD')}</strong>. Este es el importe convertido que autorizas al continuar.</div>}
        {order.status === 'pending' && <>
          {order.mode === 'demo' ? <div className="demo-controls">
            <p>Prueba el flujo de {names[order.paymentMethod]} sin ingresar datos bancarios.</p>
            <button className="button" disabled={busy} onClick={() => action('demo', { outcome: 'approved' })}>Simular pago aprobado</button>
            <button className="secondary-button" disabled={busy} onClick={() => action('demo', { outcome: 'declined' })}>Simular pago rechazado</button>
            <button className="secondary-button" disabled={busy} onClick={() => action('demo', { outcome: 'cancelled' })}>Cancelar prueba</button>
          </div> : <div className="demo-controls">
            <p>{order.paymentMethod === 'paypal' ? 'Completa el pago en PayPal y regresa para confirmarlo.' : 'Completa el pago en Mercado Pago, donde podrás elegir Yape o tu tarjeta Visa. Luego regresa para verificarlo.'}</p>
            <button className="button" disabled={busy} onClick={() => action('pay')}>Continuar con {names[order.paymentMethod]} ↗</button>
            <button className="secondary-button" disabled={busy} onClick={() => action('confirm')}>Ya pagué · Verificar pago</button>
          </div>}
        </>}
        {busy && <p role="status">Procesando… No cierres esta página.</p>}
        {message && <p role="status" className="payment-notice">{message}</p>}
        {completed && <button className="button" onClick={finish}>Terminar y retirar estos productos del carrito</button>}
        {order.status === 'cancelled' && <Link href="/carrito" className="button" onClick={() => { try { sessionStorage.removeItem('julia-checkout-attempt') } catch { /* Memoria. */ } }}>Volver e intentar de nuevo</Link>}
      </section>}
    </main>
  </>
}
