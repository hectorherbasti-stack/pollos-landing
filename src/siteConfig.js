// Datos del negocio: editá estos valores para personalizar la landing.
export const site = {
  businessName: 'Pollos Doña Rosa',
  tagline: 'Pollo fresco del día, directo del mercado a tu mesa',
  whatsappNumber: '5491122334455', // formato internacional, sin + ni espacios
  phoneDisplay: '+54 9 11 2233-4455',
  market: 'Mercado Central',
  stall: 'Puesto 24, Pasillo B',
  address: 'Av. Siempre Viva 123, Ciudad',
  hours: [
    { day: 'Lunes a viernes', time: '6:00 – 15:00' },
    { day: 'Sábados', time: '6:00 – 13:00' },
    { day: 'Domingos', time: 'Cerrado' },
  ],
  mapQuery: 'Mercado Central',
}

export const products = [
  {
    name: 'Pollo entero',
    description: 'Pollo entero fresco, ideal para el horno o la parrilla.',
    price: '$3.500 / kg',
    emoji: '🐔',
  },
  {
    name: 'Pollo trozado',
    description: 'Presas a elección: pechuga, muslo, ala o pata-muslo.',
    price: '$3.800 / kg',
    emoji: '🍗',
  },
  {
    name: 'Milanesas de pollo',
    description: 'Filetes limpios, listos para empanar.',
    price: '$4.200 / kg',
    emoji: '🍽️',
  },
  {
    name: 'Menudencias',
    description: 'Mollejas, hígados y corazones frescos.',
    price: '$1.800 / kg',
    emoji: '🥘',
  },
]

export const features = [
  {
    title: 'Fresco todos los días',
    description: 'Compramos y despostamos cada mañana, nada de cámara de frío por semanas.',
    icon: '✅',
  },
  {
    title: 'Precios justos',
    description: 'Precio de mercado, sin intermediarios y sin sorpresas al pagar.',
    icon: '💰',
  },
  {
    title: 'Atención directa',
    description: 'Elegís el corte y la cantidad en el momento, cara a cara en el puesto.',
    icon: '🤝',
  },
]

export function buildWhatsappLink(message) {
  const base = `https://wa.me/${site.whatsappNumber}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}
