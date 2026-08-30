import { site, buildWhatsappLink } from '../siteConfig'

export default function WhatsappFloat() {
  return (
    <a
      href={buildWhatsappLink(`Hola ${site.businessName}, quiero hacer un pedido.`)}
      target="_blank"
      rel="noreferrer"
      aria-label="Escribir por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-green-600"
    >
      💬
    </a>
  )
}
