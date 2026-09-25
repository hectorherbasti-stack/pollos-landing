"""Punto de composición: conecta HTTP, casos de uso y adaptadores concretos."""
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
import os

from fastapi import Depends, FastAPI, Request
from psycopg import Connection, OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from application.catalog import Catalog, Sales
from application.checkout import Checkout
from domain.errors import BusinessError, Unavailable
from infrastructure.payments import HostedPayments, MercadoPagoProvider, PayPalProvider
from infrastructure.remote_payments import RemotePayments
from infrastructure.postgres import PostgresCatalog, PostgresOrders, PostgresSales
from presentation.common import business_error_handler
from presentation.http import create_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    token = os.environ.get('BACKEND_API_KEY', '')
    if not token:
        raise RuntimeError('Falta BACKEND_API_KEY')
    app.state.api_key = token
    if os.environ.get('PAYMENTS_SERVICE_URL') and not os.environ.get('PAYMENTS_API_KEY'):
        raise RuntimeError('Falta PAYMENTS_API_KEY para conectar el servicio de pagos')
    with ConnectionPool(
        os.environ['DATABASE_URL'], min_size=1, max_size=10,
        timeout=10, kwargs={'row_factory': dict_row, 'connect_timeout': 10},
    ) as pool:
        pool.wait(timeout=30)
        with pool.connection() as conn:
            conn.execute('SELECT pg_advisory_xact_lock(726341)')
            conn.execute(Path(__file__).with_name('schema.sql').read_text())
        app.state.pool = pool
        yield


def connection(request: Request):
    try:
        # Una transacción por solicitud: commit al completar; rollback ante cualquier error.
        with request.app.state.pool.connection() as conn:
            yield conn
    except (OperationalError, PoolTimeout):
        raise Unavailable('Base de datos no disponible') from None


Database = Annotated[Connection, Depends(connection)]


def catalog_service(conn: Database):
    return Catalog(PostgresCatalog(conn))


def sales_service(conn: Database):
    return Sales(PostgresSales(conn))


def payment_gateway():
    if os.environ.get('PAYMENTS_SERVICE_URL'):
        return RemotePayments(os.environ['PAYMENTS_SERVICE_URL'], os.environ.get('PAYMENTS_API_KEY', ''))
    mercado = MercadoPagoProvider()
    return HostedPayments({'paypal': PayPalProvider(), 'yape': mercado, 'visa': mercado})


def checkout_service(conn: Database, payments: Annotated[object, Depends(payment_gateway)]):
    return Checkout(PostgresOrders(conn), payments)


def health_check(conn: Database):
    conn.execute('SELECT 1')


app = FastAPI(title='Julia API', version='1.0.0', lifespan=lifespan)
app.add_exception_handler(BusinessError, business_error_handler)
app.include_router(create_router(catalog_service, sales_service, checkout_service, health_check, payment_gateway))
