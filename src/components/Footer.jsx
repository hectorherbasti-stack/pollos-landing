import { site } from '../siteConfig'

export default function Footer() {
  return (
    <footer className="bg-amber-950 py-8 text-center text-sm text-amber-100/70">
      <p>
        © {new Date().getFullYear()} {site.businessName}. Todos los derechos reservados.
      </p>
    </footer>
  )
}
