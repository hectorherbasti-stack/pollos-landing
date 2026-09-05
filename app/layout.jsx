import './globals.css'

// oxlint-disable-next-line react/only-export-components -- Next.js metadata convention
export const metadata = {
  title: 'Julia | Pollo fresco cada día',
  description: 'Pollo fresco, cortes a pedido y atención directa por WhatsApp.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
