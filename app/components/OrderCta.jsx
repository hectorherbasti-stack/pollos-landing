import { buildWhatsappLink } from '../../src/siteConfig'

export default function OrderCta({ session, message, className, ariaLabel, children, callbackUrl = '/' }) {
  if (session) {
    return (
      <a className={className} href={buildWhatsappLink(message)} target="_blank" rel="noreferrer" aria-label={ariaLabel}>
        {children}
      </a>
    )
  }

  return (
    <a className={className} href={`/ingresar?callbackUrl=${encodeURIComponent(callbackUrl)}`} aria-label={ariaLabel}>
      {children}
    </a>
  )
}
