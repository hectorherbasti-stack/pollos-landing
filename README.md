# Pollos Doña Rosa 🐔

Landing page para un puesto de venta de pollos en el mercado. Pensada para mostrar
productos, horarios, ubicación y facilitar pedidos por WhatsApp.

## Stack

- [Vite](https://vite.dev/)
- [React](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/) (vía `@tailwindcss/vite`)

## Secciones

- **Hero** — presentación del negocio y llamado a la acción.
- **Productos** — catálogo con precios de referencia y botón de pedido directo por WhatsApp.
- **Nosotros** — motivos para elegir el puesto (frescura, precio, atención).
- **Ubicación** — mapa embebido, dirección y horarios de atención.
- **Contacto** — WhatsApp y teléfono, más un botón flotante fijo en toda la página.

## Personalización

Todos los datos del negocio (nombre, teléfono, WhatsApp, dirección, horarios,
productos y precios) están centralizados en [`src/siteConfig.js`](./src/siteConfig.js).
Editá ese archivo para adaptar la landing a tu negocio sin tocar los componentes.

## Desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Build de producción

```bash
npm run build
npm run preview
```

Genera los archivos estáticos en `dist/`, listos para desplegar en cualquier
hosting estático (Vercel, Netlify, GitHub Pages, etc.).
