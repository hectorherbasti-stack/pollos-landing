import { site, buildWhatsappLink } from '../siteConfig'

export default function Contact() {
  return (
    <section id="contacto" className="bg-amber-500 py-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold text-white">¿Hacemos tu pedido?</h2>
        <p className="mt-2 text-amber-50">
          Escribinos por WhatsApp o llamanos, te confirmamos disponibilidad al instante.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a
            href={buildWhatsappLink(`Hola ${site.businessName}, quiero hacer un pedido.`)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-amber-700 shadow-md transition hover:bg-amber-50"
          >
            💬 Escribir por WhatsApp
          </a>
          <a
            href={`tel:${site.whatsappNumber}`}
            className="rounded-full border border-white px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            📞 {site.phoneDisplay}
          </a>
        </div>
      </div>
    </section>
  )
}
