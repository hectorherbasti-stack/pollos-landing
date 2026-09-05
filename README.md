# Julia

Landing y panel de ventas construidos con Next.js y PostgreSQL.

## Configuración

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
- `/panel`: registro y resumen de ventas sin autenticación.

## Producción

Configura `DATABASE_URL` como variable privada en el proveedor de despliegue. No uses el prefijo `NEXT_PUBLIC_`, porque expondría las credenciales al navegador.
