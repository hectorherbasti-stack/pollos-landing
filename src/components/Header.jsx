import { site, buildWhatsappLink } from '../siteConfig'

const links = [
  { href: '#productos', label: 'Productos' },
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#ubicacion', label: 'Ubicación' },
  { href: '#contacto', label: 'Contacto' },
]

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-amber-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <a href="#inicio" className="flex items-center gap-2 text-lg font-extrabold text-amber-900">
          <span className="text-2xl">🐔</span>
          {site.businessName}
        </a>

        <nav className="hidden gap-6 text-sm font-medium text-amber-900/80 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-amber-600">
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href={buildWhatsappLink(`Hola ${site.businessName}, quiero hacer un pedido.`)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          Pedir por WhatsApp
        </a>
      </div>
    </header>
  )
}
