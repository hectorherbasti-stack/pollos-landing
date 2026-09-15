# Julia

Landing y panel de ventas construidos con Next.js y PostgreSQL.

## Docker y Docker Compose

Requiere Docker Engine con el complemento Compose, o Docker Desktop.

Una **imagen Docker** es el paquete con la aplicación y sus dependencias; un
**contenedor** es una instancia de esa imagen en ejecución. **Docker Compose**
define y arranca los servicios juntos mediante `compose.yaml`.

| Servicio | Imagen | Uso |
| --- | --- | --- |
| `app` | `pollos-landing:local` | Se construye con el `Dockerfile`, basado en `node:22-bookworm-slim`. Ejecuta Next.js en producción como usuario sin privilegios. |
| `db` | `postgres:17-bookworm` | PostgreSQL con datos persistentes en el volumen `postgres_data`. |

1. Copia las variables de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env`: configura `POSTGRES_PASSWORD`, `PANEL_PASSWORD` y `AUTH_SECRET`.
   Puedes ejecutar `openssl rand -hex 32` para generar cada valor por separado.
   Compose configura `DATABASE_URL` automáticamente para conectarse al servicio
   `db`; no utiliza el valor de ejemplo ni `.env.local`.
   Para el login de clientes, configura también `AUTH_GOOGLE_ID` y
   `AUTH_GOOGLE_SECRET`, con el callback de Google
   `http://localhost:3000/api/auth/callback/google`.
3. Construye las imágenes y levanta los servicios:

   ```bash
   docker compose up --build -d
   ```

Abre http://localhost:3000. La aplicación espera a que PostgreSQL esté disponible
y crea las tablas y productos iniciales al conectarse por primera vez.
Los secretos se entregan al arrancar los contenedores y se excluyen de la imagen.

Comandos útiles:

```bash
docker compose ps                 # Estado de los servicios
docker compose logs -f app        # Logs de la aplicación
docker compose down              # Detener; conserva los datos
docker compose up --build -d      # Reconstruir después de cambiar código
```

`docker compose down -v` elimina también los datos de PostgreSQL. Cambiar
`POSTGRES_PASSWORD` después de inicializar el volumen no cambia la contraseña
existente de la base; debes actualizarla también en PostgreSQL.

Esta configuración publica la aplicación solo en la máquina local y mantiene
PostgreSQL en la red interna. Para un despliegue público, configura un proxy HTTPS,
la publicación del puerto y `AUTH_URL` con tu dominio.

## Desarrollo sin Docker

1. Crea una base PostgreSQL local o administrada.
2. Copia `.env.example` como `.env.local`.
3. Reemplaza `DATABASE_URL` con la URL real de conexión.
4. Inicia el proyecto:

```bash
npm run dev
```

Al conectarse por primera vez, la aplicación crea las tablas, índices y productos iniciales automáticamente. El esquema también está disponible en `database/schema.sql` para ejecutarlo manualmente.

## Rutas

- `/`: catálogo público.
- `/panel`: registro y resumen de ventas, protegido con `PANEL_PASSWORD`.

## Producción

Configura `DATABASE_URL` como variable privada en el proveedor de despliegue. No uses el prefijo `NEXT_PUBLIC_`, porque expondría las credenciales al navegador.
