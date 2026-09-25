# Julia

Landing y panel de ventas con Next.js, backend Python/FastAPI y PostgreSQL.

En Docker, Next.js consulta el servicio de comercio (FastAPI) para productos,
pedidos, ventas y estadísticas. Comercio llama al microservicio de pagos por HTTP.
Auth.js conserva su conexión directa a PostgreSQL para las sesiones de Google.

## Arquitectura y pruebas rápidas

El backend usa arquitectura hexagonal: dominio, casos de uso, puertos y adaptadores
de HTTP, PostgreSQL y pagos. Next.js compone sus adaptadores en `lib/backend.js`.
La estructura, los criterios SOLID y las garantías transaccionales están descritos
en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
Los servicios, sus contratos y el despliegue están descritos en
[docs/MICROSERVICIOS.md](docs/MICROSERVICIOS.md).

`npm test` ejecuta las pruebas del servidor web. Desde `backend/`,
`python3 -m unittest discover -s tests -p test_core.py -v` prueba el núcleo sin
instalar dependencias ni iniciar Docker. La suite con PostgreSQL se ejecuta con
el comando de Docker indicado más abajo.

## Docker y Docker Compose

Requiere Docker Engine con el complemento Compose, o Docker Desktop.

Una **imagen Docker** es el paquete con la aplicación y sus dependencias; un
**contenedor** es una instancia de esa imagen en ejecución. **Docker Compose**
define y arranca los servicios juntos mediante `compose.yaml`.

| Servicio | Imagen | Uso |
| --- | --- | --- |
| `app` | `pollos-landing:local` | Se construye con el `Dockerfile`, basado en `node:22-bookworm-slim`. Ejecuta Next.js en producción como usuario sin privilegios. |
| `backend` | `pollos-backend:local` | Servicio de comercio: catálogo, pedidos, ventas y PostgreSQL. Se construye desde `backend/Dockerfile`. |
| `payments` | `pollos-payments:local` | Servicio de pagos sin base de datos, con las credenciales de pasarelas. Imagen independiente desde `backend/Dockerfile.payments`; puerto interno 8001. |
| `db` | `postgres:17-bookworm` | PostgreSQL con datos persistentes en el volumen `postgres_data`. |

1. Copia las variables de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env`: configura `POSTGRES_PASSWORD`, `PANEL_PASSWORD`, `AUTH_SECRET`, `BACKEND_API_KEY` y `PAYMENTS_API_KEY`.
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

Abre http://localhost:3000. Comercio espera a PostgreSQL y pagos y crea las tablas de negocio
y productos iniciales si aún no existen; Next.js espera a que FastAPI esté saludable.
Los volúmenes existentes se conservan. La documentación interactiva de la API está
en http://localhost:8000/docs y el esquema en http://localhost:8000/openapi.json.
Los secretos se entregan al arrancar los contenedores y se excluyen de la imagen.

Comandos útiles:

```bash
docker compose ps                 # Estado de los servicios
docker compose logs -f app        # Logs de la aplicación
docker compose logs -f backend    # Logs de FastAPI
docker compose logs -f payments   # Logs del servicio de pagos
docker compose up --build -d payments  # Actualizar pagos de forma independiente
docker compose down              # Detener; conserva los datos
docker compose up --build -d      # Reconstruir después de cambiar código
```

`docker compose down -v` elimina también los datos de PostgreSQL. Cambiar
`POSTGRES_PASSWORD` después de inicializar el volumen no cambia la contraseña
existente de la base; debes actualizarla también en PostgreSQL.

Esta configuración publica la aplicación solo en la máquina local y mantiene
PostgreSQL y pagos sin puertos publicados al host. Para un despliegue público, configura un proxy HTTPS,
la publicación del puerto y `AUTH_URL` con tu dominio.

## API de FastAPI

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | `/health` | Público | Comprueba la conexión a PostgreSQL. |
| GET | `/products` | Público | Productos activos sin costos privados. |
| GET | `/dashboard` | Bearer token | Totales, rendimiento e historial de las últimas 12 ventas. |
| POST | `/sales` | Bearer token | Registra una venta y devuelve su ID (201). |

Ejemplo de cuerpo para `/sales`:

```json
{ "productId": 1, "quantity": 2.5 }
```

La cantidad admite hasta dos decimales, debe ser mayor que cero y no superar 1000.
Los precios se obtienen de PostgreSQL y se conservan en la venta como valores históricos
en céntimos. Un producto inexistente o inactivo devuelve 404; datos inválidos, 422.

En Swagger (`/docs`), pulsa **Authorize** e introduce `BACKEND_API_KEY` de tu `.env`
para probar las rutas privadas. Estas operaciones escriben en tu base local.
Next.js valida la sesión del panel antes de enviar ese token desde el servidor;
el token nunca se entrega al navegador. No hace falta CORS porque el navegador
envía los formularios a Next.js y Next.js llama a FastAPI por la red de Docker.

Para probar la API automáticamente contra PostgreSQL:

```bash
docker compose -f compose.yaml -f compose.test.yaml --profile test run --build --rm backend-tests
```

Las pruebas validan autenticación, cantidades, productos inactivos, precios históricos
y totales. Usan transacciones con rollback para no dejar ventas de prueba.
También validan el contrato interno, fallos de red y comunicación HTTP real con
`payments-test`, una instancia independiente en modo demo sin claves de pasarelas.

## Desarrollo de Python

El comando `docker compose up --build -d` no requiere instalar Python localmente.
Después de editar el backend, reconstruye con `docker compose up --build -d backend`.
Para actualizar pagos, usa `docker compose up --build -d payments`.
Para ejecutar Python fuera de Docker, usa Python 3.12 y una PostgreSQL accesible:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Exporta DATABASE_URL y BACKEND_API_KEY antes de iniciar.
uvicorn main:app --reload --port 8000
```

El proceso de Python lee variables de entorno, no carga `.env` automáticamente.
Para ejecutar pagos aparte, exporta `PAYMENTS_API_KEY`, `PAYMENTS_MODE` y las
variables de pasarelas necesarias, y ejecuta `uvicorn payments_main:app --port 8001`.
En el proceso de comercio define `PAYMENTS_SERVICE_URL=http://localhost:8001` y
la misma `PAYMENTS_API_KEY`. Omitir `PAYMENTS_SERVICE_URL` conserva el modo integrado.
Para conectar Next.js fuera de Docker, añade `BACKEND_URL=http://localhost:8000`
y la misma `BACKEND_API_KEY` en `.env.local`, además de su `DATABASE_URL` para Auth.js.

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

Vercel conserva el acceso directo anterior si `BACKEND_URL` no está definida.
Docker no publica ni cambia el despliegue de Vercel. Para usar FastAPI desde Vercel,
primero despliega el backend en un servidor accesible por HTTPS y configura allí
`DATABASE_URL` y `BACKEND_API_KEY`; en Vercel define su URL pública como `BACKEND_URL`
y la misma clave. `http://backend:8000` solo existe dentro de Docker Compose.
Para la separación en microservicios, despliega también pagos y configura en
comercio `PAYMENTS_SERVICE_URL` y `PAYMENTS_API_KEY`. Las credenciales de PayPal
y Mercado Pago se configuran únicamente en el servicio de pagos.

## Carrito y pagos de prueba

El catálogo permite agregar productos al carrito (`/carrito`), ajustar kilos,
quitar productos y revisar el total. El carrito se conserva en el navegador.
El checkout permite comprar como invitado con nombre, correo y celular; el método
actual de entrega es recojo en tienda, sin envío.

Por defecto Docker usa `PAYMENTS_MODE=demo`. No necesitas cuentas de comercio ni
claves de PayPal/Mercado Pago para probarlo:

1. Ejecuta `docker compose up --build -d`.
2. Abre http://localhost:3000, agrega productos y entra al carrito.
3. Completa datos de prueba y selecciona **PayPal**, **Yape** o **Visa**.
4. Pulsa **Revisar pedido**. El servidor vuelve a consultar precios y disponibilidad.
5. En el detalle del pedido, simula un pago aprobado, rechazado o cancelado.

La demostración **no llama a las pasarelas ni realiza cobros**. Los pedidos se
persisten en PostgreSQL con estado `simulated` al aprobar la prueba; no generan
ventas ni ganancias en el panel. Un rechazo permite reintentar el mismo pedido.
Al cancelar, puedes regresar al carrito e iniciar un pedido nuevo.

### Pruebas con las pasarelas externas

Además de la demostración local, hay adaptadores para PayPal Orders API y
Mercado Pago Checkout Pro. Estos necesitan credenciales y una URL de retorno
HTTPS; no han sido verificados con una cuenta de comercio de este proyecto.

| Variable | Uso |
| --- | --- |
| `PAYMENTS_MODE=demo` | Simulación local sin dinero ni llamadas externas. Valor por defecto. |
| `PAYMENTS_MODE=sandbox` | Credenciales de prueba y confirmaciones verificadas por el servidor. |
| `PAYMENTS_MODE=live` | Cobros reales; requiere validar primero la integración con el comercio. |
| `CHECKOUT_PUBLIC_URL` | URL de Next.js para volver del pago. En local: `http://localhost:3000`. Las pasarelas requieren HTTPS. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Credenciales del entorno PayPal seleccionado. Solo en el servicio `payments` de Docker. |
| `PAYPAL_USD_PER_PEN` | Dólares por sol, definidos por el comercio. No se presupone un tipo de cambio. |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial del entorno de una cuenta peruana con los métodos habilitados. |

PayPal no ofrece PEN en su lista de monedas. La integración convierte el importe a
USD usando el valor configurado por el comercio y conserva esa cotización en el
pedido. El comprador ve el importe exacto en USD antes de continuar. El comercio
es responsable de mantener la conversión actualizada.

Yape y Visa abren el checkout alojado de Mercado Pago. El método seleccionado se
sugiere a la pasarela; los métodos finalmente disponibles dependen de la cuenta y
el comprador puede cambiar de método allí. El proyecto no recibe números de
tarjeta, CVV, contraseñas de PayPal ni códigos OTP de Yape.

Al regresar, **Ya pagué · Verificar pago** consulta el estado real en la pasarela;
un parámetro `success` en la URL nunca marca el pedido como pagado. Una confirmación
en sandbox produce `test_paid`, sin contabilizar ventas. Solo un pago confirmado
en `live` produce `paid` y crea las líneas de venta una sola vez.

Para compradores que cierran la página antes de regresar, existe
`POST /checkout/reconcile`, protegido por `BACKEND_API_KEY`. Antes de activar
cobros reales, programa su ejecución periódica desde el servidor. No se han
configurado webhooks ni un programador externo en este proyecto. Los reembolsos y
contracargos se gestionan en la pasarela; todavía no se sincronizan en este panel.

### API y protección de pedidos

Next.js ofrece un proxy limitado en `/api/checkout/*`; envía la clave del backend
solo desde el servidor y una identidad aleatoria en cookie `HttpOnly`. No se usa
el correo del formulario para autorizar el acceso a pedidos.

| Ruta de FastAPI | Función |
| --- | --- |
| `GET /checkout/config` | Modo y métodos disponibles, sin secretos. |
| `POST /orders` | Crear un pedido a partir de productos y cantidades. |
| `GET /orders/{id}` | Obtener el pedido de la sesión actual. |
| `POST /orders/{id}/pay` | Obtener el enlace de la pasarela. |
| `POST /orders/{id}/confirm` | Verificar/capturar el pago con la pasarela. |
| `POST /orders/{id}/demo` | Simular aprobación, rechazo o cancelación. Solo en `demo`. |
| `POST /checkout/reconcile` | Verificar pedidos pendientes desde un trabajo del servidor. |

Todas requieren `Authorization: Bearer BACKEND_API_KEY`; las rutas de pedidos
requieren además `X-Checkout-Owner` (UUID). El navegador recibe únicamente la
información de su pedido. Las rutas que modifican datos comprueban el origen.
Los importes se calculan en el backend, redondeando cada línea al céntimo; la clave
de idempotencia y los bloqueos transaccionales evitan duplicados al reintentar.

Las pruebas cubren las tres simulaciones, propiedad del pedido, precios manipulados,
productos inactivos, claves duplicadas, confirmaciones repetidas y validación de
moneda/importe de las pasarelas mediante respuestas simuladas. Se ejecutan con el
comando de pruebas de Docker indicado arriba y hacen rollback de sus datos.

En Vercel el catálogo anterior puede seguir funcionando sin `BACKEND_URL`, pero
**el checkout requiere el backend FastAPI publicado** y sus variables. Subir el
código a GitHub por sí solo no publica FastAPI ni habilita pagos.

Referencias oficiales: [PayPal Checkout](https://developer.paypal.com/studio/checkout/standard/integrate),
[monedas de PayPal](https://developer.paypal.com/api/codes/currency/),
[Mercado Pago Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro/create-payment-preference).
