import Image from 'next/image'
import animeChicken from '../src/assets/julia-anime-chicken.png'
import { buildWhatsappLink, features, site } from '../src/siteConfig'
import { getProducts } from '../lib/db'

export const dynamic = 'force-dynamic'

const orderLink = buildWhatsappLink(`Hola ${site.businessName}, quiero hacer un pedido.`)

export default async function Home() {
  const products = await getProducts()
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Julia, ir al inicio">
          <span>J</span> Julia
        </a>
        <nav aria-label="Navegación principal">
          <a href="#productos">Carta</a>
          <a href="#nosotros">Nuestra promesa</a>
          <a href="#ubicacion">Visítanos</a>
          <a href="/panel">Panel</a>
        </nav>
        <a className="button button-small" href={orderLink} target="_blank" rel="noreferrer">
          Pedir ahora <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section id="inicio" className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Fresco de verdad, todos los días</p>
          <h1>El pollo de siempre, con el sabor que <em>sí se recuerda.</em></h1>
          <p className="hero-text">
            Cortes frescos, atención cercana y tu pedido listo para llevar. Así de simple, así de Julia.
          </p>
          <div className="hero-actions">
            <a className="button" href={orderLink} target="_blank" rel="noreferrer">Pedir por WhatsApp <span>↗</span></a>
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

      <section id="productos" className="products-section section-pad">
        <div className="section-heading">
          <div><p className="eyebrow"><span /> Nuestra carta</p><h2>Elige tu favorito</h2></div>
          <p>Cortes frescos preparados como los necesitas. Consulta la disponibilidad del día.</p>
        </div>
        <div className="product-grid">
          {products.map((product, index) => (
            <article className="product-card" key={product.name}>
              <div className="product-top"><span>0{index + 1}</span><b>{product.emoji}</b></div>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="product-bottom">
                <strong>{new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(product.salePriceCents / 100)} / kg</strong>
                <a href={buildWhatsappLink(`Hola Julia, quiero pedir: ${product.name}`)} target="_blank" rel="noreferrer" aria-label={`Pedir ${product.name}`}>↗</a>
              </div>
            </article>
          ))}
        </div>
      </section>

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

      <section id="ubicacion" className="location section-pad">
        <div className="location-card">
          <div className="location-copy">
            <p className="eyebrow"><span /> Ven a visitarnos</p>
            <h2>Tu pedido fresco te espera.</h2>
            <div className="info-block"><small>DIRECCIÓN</small><strong>{site.market} · {site.stall}</strong><p>{site.address}</p></div>
            <div className="info-block"><small>HORARIOS</small>{site.hours.map((hour) => <p className="hours" key={hour.day}><span>{hour.day}</span><strong>{hour.time}</strong></p>)}</div>
            <a className="button" href={orderLink} target="_blank" rel="noreferrer">Escribir a Julia <span>↗</span></a>
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

      <a className="whatsapp" href={orderLink} target="_blank" rel="noreferrer" aria-label="Escribir a Julia por WhatsApp">💬</a>
    </main>
  )
}
