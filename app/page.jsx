import Image from 'next/image'
import animeChicken from '../src/assets/julia-anime-chicken.png'
import { site, features } from '../src/siteConfig'
import { getProducts } from '../lib/db'
import { auth, signOut } from '../auth'
import OrderCta from './components/OrderCta'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Ejecutamos autenticación y consulta de productos en paralelo para reducir espera.
  const [session, products] = await Promise.all([auth(), getProducts()])
  // Google Maps recibe una búsqueda codificada para formar la URL segura del iframe.
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`
  const greeting = `Hola ${site.businessName}, quiero hacer un pedido.`

  return (
    <main>
      {/* Cabecera: marca, navegación, estado de sesión y llamada a la acción. */}
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Julia, ir al inicio">
          <span>J</span> Julia
        </a>
        <nav aria-label="Navegación principal">
          <a href="#productos">Carta</a>
          <a href="#nosotros">Nuestra promesa</a>
          <a href="#ubicacion">Visítanos</a>
          <a href="/panel">Panel</a>
          {session && (
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }) }}>
              <button type="submit" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
                Hola, {session.user.name?.split(' ')[0]} · Salir
              </button>
            </form>
          )}
        </nav>
        <OrderCta session={session} message={greeting} className="button button-small" ariaLabel="Pedir ahora">
          {session ? <>Pedir ahora <span aria-hidden="true">↗</span></> : <>Inicia sesión para comprar</>}
        </OrderCta>
      </header>

      {/* Hero: propuesta principal y mascota optimizada por next/image. */}
      <section id="inicio" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Fresco de verdad, todos los días</p>
          <h1>El pollo de siempre, con el sabor que <em>sí se recuerda.</em></h1>
          <p className="hero-text">
            Cortes frescos, atención cercana y tu pedido listo para llevar. Así de simple, así de Julia.
          </p>
          <div className="hero-actions">
            <OrderCta session={session} message={greeting} className="button" ariaLabel="Pedir por WhatsApp">
              {session ? <>Pedir por WhatsApp <span>↗</span></> : <>Inicia sesión para pedir <span>↗</span></>}
            </OrderCta>
            <a className="text-link" href="#productos">Conoce nuestros cortes <span>↓</span></a>
          </div>
          <div className="hero-proof">
            <strong>Preparado hoy</strong>
            <span />
            <p>Seleccionamos y preparamos cada pedido en el momento.</p>
          </div>
        </div>

        <div className="hero-art" aria-label="Mascota de Julia">
          <div className="sun-shape" />
          <p className="stamp">100%<br /><strong>FRESCO</strong></p>
          <div className="chicken-stage">
            <Image className="chicken-bounce" src={animeChicken} alt="Pollo estilo anime de Julia" priority sizes="(max-width: 768px) 80vw, 520px" />
          </div>
          <div className="market-note">
            <span>Estamos en</span>
            <strong>{site.market}</strong>
            <small>{site.stall}</small>
          </div>
        </div>
      </section>

      {/* Catálogo: products proviene de PostgreSQL, no de un arreglo fijo. */}
      <section id="productos" className="products-section section-pad">
        <div className="section-heading">
          <div><p className="eyebrow"><span /> Nuestra carta</p><h2>Elige tu favorito</h2></div>
          <p>Cortes frescos preparados como los necesitas. Consulta la disponibilidad del día.</p>
        </div>
        <div className="product-grid">
          {/* map convierte cada fila de PostgreSQL en una tarjeta visual. */}
          {products.map((product, index) => (
            <article className="product-card" key={product.name}>
              <div className="product-top"><span>0{index + 1}</span><b>{product.emoji}</b></div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="product-bottom">
                <strong>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(product.salePriceCents / 100)} / kg</strong>
                <OrderCta session={session} message={`Hola Julia, quiero pedir: ${product.name}`} ariaLabel={`Pedir ${product.name}`}>
                  ↗
                </OrderCta>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Beneficios comerciales configurables desde src/siteConfig.js. */}
      <section id="nosotros" className="promise section-pad">
        <div className="promise-title">
          <p className="eyebrow light"><span /> La promesa Julia</p>
          <h2>Del mercado<br />a tu mesa.</h2>
          <p>Sin vueltas, sin secretos. Solo buen producto y una atención que te hace volver.</p>
        </div>
        <div className="feature-list">
          {features.map((feature, index) => (
            <article key={feature.title}>
              <span>0{index + 1}</span>
              <div><h3>{feature.title}</h3><p>{feature.description}</p></div>
              <b>{feature.icon}</b>
            </article>
          ))}
        </div>
      </section>

      {/* Ubicación, horarios y mapa externo cargado de forma diferida. */}
      <section id="ubicacion" className="location section-pad">
        <div className="location-card">
          <div className="location-copy">
            <p className="eyebrow"><span /> Ven a visitarnos</p>
            <h2>Tu pedido fresco te espera.</h2>
            <div className="info-block"><small>DIRECCIÓN</small><strong>{site.market} · {site.stall}</strong><p>{site.address}</p></div>
            <div className="info-block"><small>HORARIOS</small>{site.hours.map((hour) => <p className="hours" key={hour.day}><span>{hour.day}</span><strong>{hour.time}</strong></p>)}</div>
            <OrderCta session={session} message={greeting} className="button" ariaLabel="Escribir a Julia">
              {session ? <>Escribir a Julia <span>↗</span></> : <>Inicia sesión para escribir <span>↗</span></>}
            </OrderCta>
          </div>
          <iframe title="Ubicación de Julia en el mapa" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>

      <footer>
        <div className="footer-brand">Julia<span>.</span></div>
        <p>Pollo fresco, atención honesta.</p>
        <a href={`tel:${site.whatsappNumber}`}>{site.phoneDisplay}</a>
        <small>© {new Date().getFullYear()} Julia</small>
      </footer>

      <OrderCta session={session} message={greeting} className="whatsapp" ariaLabel="Escribir a Julia por WhatsApp">
        💬
      </OrderCta>
    </main>
  )
}
