"""Servicio de pagos independiente: sin conexión ni credenciales de PostgreSQL."""
from contextlib import asynccontextmanager
import os
from typing import Annotated

from fastapi import Depends, FastAPI

from contracts.payments_v1 import PaymentConfiguration, PaymentOrder, StartResult, VerifyRequest, VerifyResult
from domain.errors import BusinessError, Conflict, Forbidden, Unavailable
from infrastructure.payments import HostedPayments, MercadoPagoProvider, PayPalProvider
from presentation.common import business_error_handler, require_admin


@asynccontextmanager
async def lifespan(app):
    token = os.environ.get('PAYMENTS_API_KEY', '')
    if not token:
        raise RuntimeError('Falta PAYMENTS_API_KEY')
    app.state.api_key = token
    yield


def payment_gateway():
    mercado = MercadoPagoProvider()
    return HostedPayments({'paypal': PayPalProvider(), 'yape': mercado, 'visa': mercado})


Gateway = Annotated[HostedPayments, Depends(payment_gateway)]
app = FastAPI(title='Julia Payments Service', version='1.0.0', lifespan=lifespan)
app.add_exception_handler(BusinessError, business_error_handler)
private = [Depends(require_admin)]


@app.get('/health')
def health():
    # Salud del proceso. La disponibilidad de métodos se consulta en /v1/config.
    return {'status': 'ok', 'service': 'payments'}


@app.get('/v1/config', dependencies=private, response_model=PaymentConfiguration)
def configuration(gateway: Gateway):
    return gateway.configuration()


@app.post('/v1/payments/start', dependencies=private, response_model=StartResult)
def start(order: PaymentOrder, gateway: Gateway):
    config = gateway.configuration()
    if order.payment_mode != config['mode']:
        raise Conflict('Este pedido pertenece a otro entorno de pagos')
    if config['mode'] == 'demo':
        raise Forbidden('El modo demo no inicia pagos externos')
    if not any(method['id'] == order.payment_method and method['available'] for method in config['methods']):
        raise Unavailable('Este método de pago todavía no está configurado')
    reference, url = gateway.start(order.model_dump())
    return StartResult(reference=reference, url=url)


@app.post('/v1/payments/verify', dependencies=private, response_model=VerifyResult)
def verify(body: VerifyRequest, gateway: Gateway):
    if body.order.payment_mode != gateway.mode():
        raise Conflict('Este pedido pertenece a otro entorno de pagos')
    if body.order.payment_mode == 'demo':
        return VerifyResult(payment_id=None)
    return VerifyResult(payment_id=gateway.verify(body.order.model_dump(), body.capture))
