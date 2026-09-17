'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'

const CartContext = createContext(null)
const storageKey = 'julia-cart-v1'

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      // oxlint-disable-next-line react/set-state-in-effect -- Sincroniza almacenamiento del navegador después del SSR.
      if (Array.isArray(saved)) setItems(saved.filter(item => Number.isSafeInteger(item.productId)
        && item.productId > 0 && Number.isFinite(item.quantity) && item.quantity >= 0.01
        && item.quantity <= 1000).slice(0, 50))
    } catch { /* Un carrito corrupto no impide comprar. */ }
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(storageKey, JSON.stringify(items)) } catch { /* Sigue en memoria. */ }
    }
  }, [items, ready])
  function add(product) {
    setItems(current => {
      const existing = current.find(item => item.productId === product.id)
      return existing
        ? current.map(item => item.productId === product.id ? { ...item, quantity: Math.min(1000, Math.round((item.quantity + 1) * 100) / 100) } : item)
        : [...current, { productId: product.id, quantity: 1 }]
    })
    setMessage(`${product.name} agregado al carrito`)
  }
  function update(productId, quantity) {
    setItems(current => quantity <= 0 ? current.filter(item => item.productId !== productId)
      : current.map(item => item.productId === productId ? { ...item, quantity: Math.min(1000, Math.max(0.01, Math.round(quantity * 100) / 100)) } : item))
  }
  return <CartContext.Provider value={{ items, ready, add, update, clear: () => setItems([]) }}>
    {children}
    <div className="sr-only" role="status" aria-live="polite">{message}</div>
  </CartContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- Shared cart hook.
export function useCart() { return useContext(CartContext) }

export function CartLink() {
  const { items } = useCart()
  return <Link href="/carrito" className="cart-link">Carrito <span>{items.length}</span></Link>
}

export function AddToCart({ product }) {
  const { add, ready } = useCart()
  const [added, setAdded] = useState(false)
  return <button type="button" className="add-to-cart" disabled={!ready}
    aria-label={`Agregar ${product.name} al carrito`} onClick={() => { add(product); setAdded(true) }}>
    {added ? '✓ Agregar otro' : '+ Agregar'}
  </button>
}
