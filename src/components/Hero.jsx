import { site, buildWhatsappLink } from '../siteConfig'
import animeChicken from '../assets/julia-anime-chicken.png'

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-gradient-to-b from-amber-50 to-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
            {site.market} · {site.stall}
          </p>
          <h1 className="text-4xl font-extrabold leading-tight text-amber-950 sm:text-5xl">
            {site.tagline}
          </h1>
          <p className="mt-4 max-w-md text-base text-amber-900/70 sm:text-lg">
            Pollo trozado, entero o listo para milanesas. Elegí tu corte y lo tenés en el momento,
            fresco del puesto.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={buildWhatsappLink(`Hola ${site.businessName}, quiero hacer un pedido.`)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600"
            >
              Hacer pedido por WhatsApp
            </a>
            <a
              href="#productos"
              className="rounded-full border border-amber-300 px-6 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-50"
            >
              Ver productos
            </a>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="absolute h-64 w-64 rounded-full bg-amber-200/60 blur-3xl sm:h-80 sm:w-80" />
          <div className="chicken-stage relative flex h-56 w-56 items-center justify-center rounded-full bg-white shadow-xl ring-8 ring-amber-100 sm:h-72 sm:w-72">
            <img
              src={animeChicken}
              alt="Pollo estilo anime de Julia"
              className="chicken-bounce h-[115%] w-[115%] object-contain drop-shadow-lg"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
