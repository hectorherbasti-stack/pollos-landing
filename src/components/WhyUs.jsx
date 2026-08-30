import { features } from '../siteConfig'

export default function WhyUs() {
  return (
    <section id="nosotros" className="bg-amber-50/60 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold text-amber-950">¿Por qué elegirnos?</h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl bg-white p-6 text-center shadow-sm">
              <span className="text-3xl">{feature.icon}</span>
              <h3 className="mt-3 text-base font-bold text-amber-950">{feature.title}</h3>
              <p className="mt-2 text-sm text-amber-900/60">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
