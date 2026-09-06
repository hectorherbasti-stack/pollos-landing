import { buildWhatsappLink } from '../../src/siteConfig'

export default function OrderCta({ session, message, className, ariaLabel, children, callbackUrl = '/' }) {
  // Si existe una sesión de cliente, el botón abre WhatsApp con el mensaje preparado.
  if (session) {
    return (
      <a className={className} href={buildWhatsappLink(message)} target="_blank" rel="noreferrer" aria-label={ariaLabel}>
        {children}
      </a>
    )
  }

  // Sin sesión enviamos al login y guardamos a dónde debe regresar el cliente.
  return (
    <a className={className} href={`/ingresar?callbackUrl=${encodeURIComponent(callbackUrl)}`} aria-label={ariaLabel}>
      {children}
    </a>
  )
}
