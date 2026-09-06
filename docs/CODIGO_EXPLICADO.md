# Guía para leer el código de Julia

Esta guía explica la estructura completa del repositorio y el recorrido de los datos. Empieza aquí antes de leer archivo por archivo.

## 1. Mapa general

```text
Navegador
  ├─ GET / ───────────────> app/page.jsx ───────> lib/db.js ─────> PostgreSQL
  ├─ GET/POST /api/auth/* -> auth.js ───────────> tablas de Auth.js
  ├─ GET /ingresar ───────> Google OAuth
  └─ GET /panel
       └─ middleware.js valida cookie
            ├─ inválida -> /panel/login
            └─ válida  -> app/panel/page.jsx
                           └─ formulario -> app/actions.js -> lib/db.js
```

Next.js usa rutas basadas en carpetas. Cada `page.jsx` crea una página y cada `route.js` crea un endpoint HTTP. Los archivos bajo `lib/` no crean rutas: contienen lógica reutilizable del servidor.

## 2. Carpetas y archivos activos

### Raíz

- `package.json`: manifiesto del proyecto. Declara dependencias y comandos. `npm run dev` inicia desarrollo, `npm run build` compila, `npm run start` sirve producción y `npm run lint` revisa el código.
- `package-lock.json`: fija las versiones exactas instaladas. npm lo actualiza; normalmente no se edita a mano.
- `next.config.mjs`: configuración del framework. Actualmente conserva los valores predeterminados.
- `postcss.config.mjs`: conecta Tailwind con PostCSS para transformar `@import "tailwindcss"` durante la compilación.
- `.env.example`: plantilla de secretos necesarios. Se copia a `.env.local`, archivo que nunca debe publicarse.
- `.gitignore`: evita subir dependencias, builds, bases locales y secretos.
- `.oxlintrc.json`: reglas utilizadas por Oxlint.
- `middleware.js`: barrera previa para todas las rutas `/panel/*`.
- `auth.js`: configuración del acceso de clientes mediante Google y NextAuth.
- `AGENTS.md` y `CLAUDE.md`: instrucciones generadas para asistentes de programación; no afectan a los usuarios del sitio.
- `README.md`: instrucciones breves para instalar y ejecutar el proyecto.

### `app/`: interfaz y rutas de Next.js

- `app/layout.jsx`: documento raíz. Carga CSS global, declara metadatos SEO e inserta cada página mediante `children`.
- `app/page.jsx`: portada pública. Lee sesión y productos, construye el catálogo, ubicación, beneficios y botones de pedido.
- `app/globals.css`: identidad visual, layout responsive, panel y animación del pollo.
- `app/actions.js`: Server Action que valida y registra una venta.
- `app/components/OrderCta.jsx`: decide si un botón abre WhatsApp o pide iniciar sesión.
- `app/ingresar/page.jsx`: inicio de sesión de clientes mediante Google.
- `app/panel/page.jsx`: métricas, alta de ventas, rendimiento por producto e historial.
- `app/panel/login/page.jsx`: formulario de contraseña del dueño.
- `app/panel/login/actions.js`: verifica la contraseña y crea/elimina la cookie privada.
- `app/api/auth/[...nextauth]/route.js`: endpoint comodín usado internamente por NextAuth.

### `lib/`: lógica de servidor

- `lib/db.js`: abre el pool PostgreSQL, crea el esquema inicial y ejecuta todas las consultas comerciales.
- `lib/panelAuth.js`: contiene el nombre de la cookie y la función SHA-256 compartida por login y middleware.

### `database/`: diseño de datos

- `database/schema.sql`: esquema simple que corresponde al panel actual.
- `database/market-schema.sql`: modelo objetivo para múltiples mercados y puestos. Aún no es consumido por `lib/db.js`.
- `database/MODEL.md`: explica relaciones, decisiones y cálculos del modelo multi-puesto.

### `src/`: configuración y recursos

- `src/siteConfig.js`: datos públicos del negocio, beneficios y constructor de enlaces de WhatsApp.
- `src/assets/julia-anime-chicken.png`: imagen de la mascota importada por `app/page.jsx`.

## 3. Archivos heredados que ya no se ejecutan

`src/components/*.jsx` y `src/index.css` pertenecen a la versión anterior creada con Vite. Next.js no los importa, por lo que no afectan la aplicación actual. Se conservaron para no borrar trabajo sin autorización, pero pueden eliminarse cuando se confirme que ya no se necesitan.

Los SVG de React/Vite y `src/assets/hero.png` también son recursos heredados si ninguna búsqueda de importaciones los referencia.

## 4. Cómo se construye la portada

1. El navegador solicita `/`.
2. Next.js ejecuta `Home` de `app/page.jsx` en el servidor.
3. `Promise.all` pide simultáneamente la sesión (`auth`) y los productos (`getProducts`).
4. `getProducts` llama `ensureDatabase`, obtiene una conexión del pool y ejecuta SQL parametrizado.
5. React transforma el arreglo de productos en tarjetas usando `map`.
6. Next.js envía HTML al navegador. Las credenciales y el código PostgreSQL nunca se incluyen.
7. `OrderCta` revisa la sesión: con sesión abre WhatsApp; sin ella abre `/ingresar`.

## 5. Cómo se registra una venta

1. El dueño entra a `/panel`.
2. `middleware.js` compara la cookie `panel_auth` con el hash de `PANEL_PASSWORD`.
3. Si no coincide, redirige a `/panel/login`.
4. El formulario del panel envía `productId` y `quantity` a `createSale`.
5. `createSale` convierte y valida ambos valores.
6. `recordSale` usa parámetros `$1` y `$2`, evitando inyección SQL.
7. PostgreSQL copia el precio y costo vigentes dentro de la venta.
8. `revalidatePath` marca portada y panel para volver a consultar datos.
9. El navegador regresa al panel con un mensaje de éxito.

## 6. Cómo se calculan ingresos y ganancias

- Ingresos: `cantidad × precio de venta`.
- Costos: `cantidad × costo unitario`.
- Ganancia bruta: `cantidad × (precio de venta - costo unitario)`.

Los cálculos se ejecutan con `SUM` dentro de PostgreSQL. Esto evita descargar todas las ventas al navegador y calcularlas allí. Los montos se guardan en céntimos: `1450` representa `S/ 14.50`, evitando errores típicos de números decimales.

## 7. Dos accesos diferentes

El proyecto tiene deliberadamente dos mecanismos:

- Cliente: Google OAuth mediante NextAuth. Controla quién puede abrir los enlaces de pedido.
- Dueño: `PANEL_PASSWORD` y cookie propia. Protege las estadísticas y el alta de ventas.

No son intercambiables. `auth.js` administra clientes; `middleware.js` y `lib/panelAuth.js` administran el panel.

## 8. Variables de entorno

```env
DATABASE_URL=postgresql://...
PANEL_PASSWORD=una-clave-privada
AUTH_SECRET=un-secreto-largo
AUTH_GOOGLE_ID=identificador-de-google
AUTH_GOOGLE_SECRET=secreto-de-google
```

No uses `NEXT_PUBLIC_` para estos valores: ese prefijo los enviaría al navegador.

## 9. Cómo leer JSX y CSS

- `{expresion}` inserta JavaScript dentro del marcado.
- `condition && <Elemento />` renderiza el elemento solo cuando la condición es verdadera.
- `array.map(...)` genera un elemento por cada registro.
- `className` asigna clases CSS; en JSX no se usa el atributo HTML `class`.
- `key` ayuda a React a identificar elementos repetidos.
- `aria-label` aporta un nombre accesible cuando el contenido visual no es suficiente.
- `@media(max-width: ...)` cambia el layout en pantallas pequeñas.
- `@media(prefers-reduced-motion: reduce)` respeta usuarios que solicitaron menos animación.

## 10. Diferencia entre los dos esquemas SQL

El esquema actual guarda un producto y una venta simple. El modelo futuro separa:

```text
producto general -> producto ofrecido por un puesto -> detalle de venta
```

Esa separación permite que dos puestos vendan el mismo producto con precios, costos y stock diferentes. No ejecutes `market-schema.sql` encima de la base actual como si fuera una migración: primero debe escribirse una migración que transforme y preserve las filas existentes.
