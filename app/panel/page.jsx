import Link from 'next/link'
import { createSale } from '../actions'
import { logout } from './login/actions'
import { getDashboard, getProducts } from '../../lib/db'

export const dynamic = 'force-dynamic'

const money = (cents) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100)
const number = (value) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value)

// oxlint-disable-next-line react/only-export-components -- Next.js metadata convention
export const metadata = { title: 'Panel de ventas | Julia' }

export default async function PanelPage({ searchParams }) {
  const params = await searchParams
  const [products, { totals, byProduct, recentSales }] = await Promise.all([
    getProducts(),
    getDashboard(),
  ])

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div><p className="eyebrow"><span /> Control del negocio</p><h1>Panel de Julia</h1></div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link className="text-link" href="/">← Volver a la tienda</Link>
          <form action={logout}><button className="text-link" type="submit" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>Cerrar sesión</button></form>
        </div>
      </header>

      <section className="metrics" aria-label="Resumen de ventas">
        <article><span>Unidades vendidas</span><strong>{number(totals.units)}</strong><small>kg / unidades registradas</small></article>
        <article><span>Ingresos</span><strong>{money(totals.revenueCents)}</strong><small>ventas totales</small></article>
        <article><span>Costos</span><strong>{money(totals.costCents)}</strong><small>costo estimado</small></article>
        <article className="profit"><span>Ganancia</span><strong>{money(totals.profitCents)}</strong><small>ingresos menos costos</small></article>
      </section>

      <section className="dashboard-grid">
        <div className="sale-form-card">
          <div className="panel-title"><p>REGISTRAR</p><h2>Nueva venta</h2></div>
          {params?.success && <p className="form-message success">✓ {params.success}</p>}
          {params?.error && <p className="form-message error">{params.error}</p>}
          <form action={createSale}>
            <label htmlFor="productId">Producto</label>
            <select id="productId" name="productId" required defaultValue="">
              <option value="" disabled>Selecciona un producto</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.emoji} {product.name} — {money(product.salePriceCents)}</option>)}
            </select>
            <label htmlFor="quantity">Cantidad vendida</label>
            <div className="quantity-field"><input id="quantity" name="quantity" type="number" min="0.01" max="1000" step="0.01" placeholder="Ej. 2.5" required /><span>kg / unidades</span></div>
            <button className="button" type="submit">Guardar venta <span>↗</span></button>
          </form>
        </div>

        <div className="performance-card">
          <div className="panel-title"><p>RENDIMIENTO</p><h2>Por producto</h2></div>
          <div className="performance-list">
            {byProduct.map((product) => (
              <article key={product.name}><b>{product.emoji}</b><div><strong>{product.name}</strong><span>{number(product.units)} vendidos</span></div><div><strong>{money(product.revenueCents)}</strong><span>{money(product.profitCents)} ganancia</span></div></article>
            ))}
          </div>
        </div>
      </section>

      <section className="sales-table-card">
        <div className="panel-title"><p>HISTORIAL</p><h2>Últimas ventas</h2></div>
        {recentSales.length === 0 ? <p className="empty-state">Aún no hay ventas. Registra la primera desde el formulario.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Total</th><th>Ganancia</th><th>Fecha</th></tr></thead><tbody>
            {recentSales.map((sale) => <tr key={sale.id}><td>{sale.emoji} {sale.name}</td><td>{number(sale.quantity)}</td><td>{money(sale.totalCents)}</td><td className="positive">+{money(sale.profitCents)}</td><td>{new Date(sale.soldAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </main>
  )
}
