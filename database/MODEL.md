# Modelo de datos para puestos de mercado

## Relaciones principales

```text
markets 1 ─── N stalls
stalls  1 ─── N stall_products N ─── 1 products
products N ─── 1 product_categories

stalls    1 ─── N sales
customers 1 ─── N sales
sales     1 ─── N sale_items N ─── 1 stall_products
sales     1 ─── N sale_payments N ─── 1 payment_methods

stall_products 1 ─── N inventory_movements
sale_items     1 ─── N inventory_movements
```

## Decisiones del modelo

- `products` representa el catálogo compartido del mercado.
- `stall_products` representa lo que vende cada puesto. Aquí viven el precio, costo, disponibilidad y stock propios.
- `sales` contiene la cabecera de una operación y siempre pertenece a un puesto.
- `sale_items` permite vender varios productos en una misma operación y conserva datos históricos.
- Todos los importes monetarios se guardan en céntimos para evitar errores de punto flotante.
- `inventory_movements` funciona como kardex auditable; una corrección crea otro movimiento en vez de borrar historia.
- Una venta cancelada conserva el registro y puede generar movimientos de devolución.
- `sale_payments` permite pagos mixtos, por ejemplo parte efectivo y parte Yape.

## Cálculos

- Ingresos: suma de `sales.total_cents` para ventas completadas.
- Costo de ventas: suma de `sales.total_cost_cents` para ventas completadas.
- Ganancia bruta: ingresos menos costo de ventas.
- Stock: valor actual de `stall_products.current_stock`, respaldado por el historial de movimientos.
- Producto más vendido: suma de `sale_items.quantity`, agrupada por producto y filtrada por puesto/fecha.

## Alcance

El archivo `market-schema.sql` es el modelo objetivo multi-puesto. El esquema actual de la aplicación permanece en `schema.sql` hasta crear una migración de datos y adaptar las consultas del panel.
