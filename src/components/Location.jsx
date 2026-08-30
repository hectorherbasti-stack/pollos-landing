import { site } from '../siteConfig'

export default function Location() {
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`

  return (
    <section id="ubicacion" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-extrabold text-amber-950">Dónde encontrarnos</h2>
      </div>

      <div className="grid gap-8 overflow-hidden rounded-2xl border border-amber-100 shadow-sm md:grid-cols-2">
        <div className="h-72 w-full md:h-full">
          <iframe
            title="Ubicación en el mapa"
            src={mapSrc}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="flex flex-col justify-center gap-6 bg-white p-8">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-600">Dirección</h3>
            <p className="mt-1 text-amber-950">
              {site.market} — {site.stall}
            </p>
            <p className="text-amber-900/60">{site.address}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-600">Horarios</h3>
            <ul className="mt-1 space-y-1 text-amber-900/70">
              {site.hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-4 text-sm">
                  <span>{h.day}</span>
                  <span className="font-medium text-amber-950">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
