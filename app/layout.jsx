import './globals.css'

// Next.js transforma este objeto en <title> y <meta name="description">.
// oxlint-disable-next-line react/only-export-components -- Next.js metadata convention
export const metadata = {
  title: 'Julia | Pollo fresco cada día',
  description: 'Pollo fresco, cortes a pedido y atención directa por WhatsApp.',
}

export default function RootLayout({ children }) {
  // Todo page.jsx se inserta en children y comparte este documento HTML base.
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
