import { products, buildWhatsappLink } from '../siteConfig'

export default function Products() {
  return (
    <section id="productos" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-extrabold text-amber-950">Nuestros productos</h2>
        <p className="mt-2 text-amber-900/60">Precios de referencia, consultá disponibilidad del día.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <div
            key={product.name}
            className="flex flex-col rounded-2xl border border-amber-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <span className="text-4xl">{product.emoji}</span>
            <h3 className="mt-4 text-lg font-bold text-amber-950">{product.name}</h3>
            <p className="mt-2 flex-1 text-sm text-amber-900/60">{product.description}</p>
            <p className="mt-4 text-xl font-extrabold text-amber-600">{product.price}</p>
            <a
              href={buildWhatsappLink(`Hola, quiero pedir: ${product.name}`)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 rounded-full bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              Pedir este producto
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
