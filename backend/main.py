"""API local de Julia: catálogo público y operaciones privadas de ventas."""

from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Annotated
import os
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg import Connection, OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout
from pydantic import BaseModel, ConfigDict, Field

import queries
from checkout import create_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    token = os.environ.get('BACKEND_API_KEY', '')
    if not token:
        raise RuntimeError('Falta BACKEND_API_KEY')
    app.state.api_key = token
    with ConnectionPool(
        os.environ['DATABASE_URL'], min_size=1, max_size=10,
        timeout=10, kwargs={'row_factory': dict_row, 'connect_timeout': 10},
    ) as pool:
        pool.wait(timeout=30)
        with pool.connection() as conn:
            # Serializa la inicialización si arrancan varias instancias.
            conn.execute('SELECT pg_advisory_xact_lock(726341)')
            conn.execute(Path(__file__).with_name('schema.sql').read_text())
        app.state.pool = pool
        yield


app = FastAPI(title='Julia API', version='1.0.0', lifespan=lifespan)
bearer = HTTPBearer(auto_error=False)


def require_admin(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), request.app.state.api_key.encode()
    ):
        raise HTTPException(401, 'Credenciales inválidas', headers={'WWW-Authenticate': 'Bearer'})


def connection(request: Request):
    try:
        with request.app.state.pool.connection() as conn:
            yield conn
    except (OperationalError, PoolTimeout):
        raise HTTPException(503, 'Base de datos no disponible') from None


Database = Annotated[Connection, Depends(connection)]


class SaleInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    productId: Annotated[int, Field(strict=True, gt=0, le=9223372036854775807)]
    quantity: Annotated[Decimal, Field(gt=0, le=1000, decimal_places=2, allow_inf_nan=False)]


@app.get('/health')
def health(conn: Database):
    conn.execute('SELECT 1')
    return {'status': 'ok'}


@app.get('/products')
def products(conn: Database):
    rows = conn.execute(queries.PRODUCTS).fetchall()
    # Los costos pertenecen al panel privado, no al catálogo público.
    return [{k: v for k, v in row.items() if k != 'costPriceCents'} for row in rows]


@app.get('/dashboard', dependencies=[Depends(require_admin)])
def dashboard(conn: Database):
    return {
        'totals': conn.execute(queries.TOTALS).fetchone(),
        'byProduct': conn.execute(queries.BY_PRODUCT).fetchall(),
        'recentSales': conn.execute(queries.RECENT_SALES).fetchall(),
    }


@app.post('/sales', status_code=201, dependencies=[Depends(require_admin)])
def create_sale(sale: SaleInput, conn: Database):
    # INSERT SELECT conserva los precios del producto en el momento de la venta.
    row = conn.execute(queries.INSERT_SALE, (sale.quantity, sale.productId)).fetchone()
    if row is None:
        raise HTTPException(404, 'Producto no encontrado o inactivo')
    return {'id': row['id']}


app.include_router(create_router(connection, require_admin))
