'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useCart, CartLink } from './CartProvider'

const money = (cents, currency = 'PEN') => new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(cents / 100)
const methodDetails = { paypal: ['PayPal', 'Con tu cuenta PayPal'], yape: ['Yape', 'Desde tu celular'], visa: ['Visa', 'Tarjeta de crédito o débito'] }

export default function CartCheckout({ products }) {
  const { items, ready, update } = useCart()
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [method, setMethod] = useState('yape')
  const pending = useRef(false)
  const attempt = useRef(null)
  const lines = items.map(item => ({ ...item, product: products.find(product => product.id === item.productId) }))
  const total = lines.reduce((sum, item) => sum + Math.round((item.product?.salePriceCents || 0) * Math.round(item.quantity * 100) / 100), 0)
  const unavailable = lines.some(line => !line.product)

  useEffect(() => {
    fetch('/api/checkout/config').then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail)
      setConfig(result)
      setMethod(result.methods.find(option => option.available)?.id || 'yape')
    }).catch(cause => setError(cause.message || 'No se pudo cargar los métodos de pago.'))
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const payload = { items: items.map(({ productId, quantity }) => ({ productId, quantity })),
      customer: { name: data.get('name'), email: data.get('email'), phone: data.get('phone') }, paymentMethod: method }
    const fingerprint = JSON.stringify(payload)
    // Mantiene la misma clave incluso si se pierde la respuesta o se recarga la página.
    try {
      if (!attempt.current) attempt.current = JSON.parse(sessionStorage.getItem('julia-checkout-attempt') || 'null')
    } catch { /* Usa memoria si el almacenamiento no está disponible. */ }
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
    try { sessionStorage.setItem('julia-checkout-attempt', JSON.stringify(attempt.current)) } catch { /* Memoria. */ }
    try {
      const response = await fetch('/api/checkout/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestKey: attempt.current.key }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail)
      window.location.assign(`/pedido/${result.id}`)
    } catch (cause) {
      setError(cause.message || 'No se pudo crear el pedido. Inténtalo de nuevo.')
      pending.current = false
      setBusy(false)
    }
  }

  return <>
    <header className="site-header"><Link className="brand" href="/"><span>J</span> Julia</Link><CartLink /></header>
    <main className="checkout-page">
      <Link className="text-link" href="/#productos">← Seguir comprando</Link>
      <div className="checkout-heading"><p className="eyebrow">DE LA TIENDA A TU MESA</p><h1>Tu carrito<span>.</span></h1><p>Elige tus cortes, ajusta la cantidad y termina tu pedido.</p></div>
      {!ready ? <p role="status">Cargando tu carrito…</p> : items.length === 0 ?
        <section className="cart-empty"><span aria-hidden="true">🛒</span><h2>Algo rico está por venir.</h2><p>Agrega tus cortes favoritos y los encontrarás aquí.</p><Link href="/#productos" className="button">Ver nuestros productos ↗</Link></section> :
        <div className="checkout-grid">
          <section className="cart-items" aria-label="Productos del carrito">
            {lines.map(({ productId, quantity, product }) => <article className="cart-item" key={productId}>
              <div className="cart-emoji" aria-hidden="true">{product?.emoji || '🍗'}</div>
              <div className="cart-item-copy"><h2>{product?.name || 'Producto no disponible'}</h2><p>{product ? `${money(product.salePriceCents)} / kg` : 'Retira este producto para continuar.'}</p>
                <button className="remove-item" type="button" disabled={busy} onClick={() => update(productId, 0)}>Quitar {product?.name || 'producto'}</button></div>
              <div className="cart-item-quantity"><label htmlFor={`quantity-${productId}`}>Cantidad (kg)</label>
                <input id={`quantity-${productId}`} aria-label={`Cantidad de ${product?.name || 'producto'}`} type="number" min="0.01" max="1000" step="0.01" value={quantity} disabled={busy}
                  onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value > 0) update(productId, value) }} />
                <strong>{money(Math.round((product?.salePriceCents || 0) * Math.round(quantity * 100) / 100))}</strong></div>
            </article>)}
            <div className="pickup-note"><strong>Recojo en tienda</strong><p>Tu pedido se recoge en el puesto de Julia. No se aplica costo de envío.</p></div>
          </section>
          <form className="checkout-summary" onSubmit={submit}>
            <h2>Completa tu pedido</h2>
            {config && config.mode !== 'live' && <div className="payment-notice">{config.mode === 'demo' ? 'Modo demostración · No se realizará ningún cobro.' : 'Entorno de prueba · Usa las cuentas de prueba de la pasarela.'}</div>}
            <fieldset disabled={busy} className="customer-fields"><legend>Tus datos para el recojo</legend>
              <label htmlFor="customer-name">Nombre completo</label><input id="customer-name" name="name" autoComplete="name" required minLength={2} maxLength={100} />
              <label htmlFor="customer-email">Correo electrónico</label><input id="customer-email" name="email" type="email" autoComplete="email" required maxLength={200} />
              <label htmlFor="customer-phone">Celular</label><input id="customer-phone" name="phone" type="tel" autoComplete="tel" required pattern="\+?[0-9 ()\-]{7,20}" maxLength={20} placeholder="Ej. 987654321" />
            </fieldset>
            <fieldset className="payment-methods" disabled={busy}><legend>¿Cómo prefieres pagar?</legend>
              {Object.entries(methodDetails).map(([id, [name, description]]) => {
                const available = config?.methods.find(option => option.id === id)?.available
                return <label className={`payment-option ${method === id ? 'selected' : ''}`} key={id}>
                  <input type="radio" name="payment" value={id} checked={method === id} disabled={!available} onChange={() => setMethod(id)} />
                  <span><strong className={`payment-brand ${id}`}>{name}</strong><small>{available ? description : 'Próximamente'}</small></span>
                </label>
              })}
            </fieldset>
            <div className="checkout-total"><span>Total</span><strong>{money(total)}</strong></div>
            {method === 'paypal' && config?.mode !== 'demo' && Number(config?.usdPerPen) > 0 && <p className="checkout-help">PayPal cobrará aproximadamente {money(Math.round(total * Number(config.usdPerPen)), 'USD')}. Revisarás el importe exacto antes de pagar.</p>}
            {error && <p role="alert" className="form-message error">{error}</p>}
            <button type="submit" className="button checkout-submit" disabled={busy || unavailable || !config?.methods.some(option => option.id === method && option.available)}>{busy ? 'Creando pedido…' : 'Revisar pedido'} <span>↗</span></button>
            <p className="checkout-help">Revisarás el total antes de confirmar el pago. No necesitas una cuenta para comprar.</p>
          </form>
        </div>}
    </main>
  </>
}
