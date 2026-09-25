"""Adaptador del puerto Payments hacia el microservicio de pagos."""
from decimal import Decimal

import httpx
from pydantic import ValidationError

from contracts.payments_v1 import PaymentConfiguration, PaymentOrder, StartResult, VerifyResult
from domain.errors import Conflict, Forbidden, GatewayFailure, InvalidInput, Unavailable


class RemotePayments:
    def __init__(self, base_url, api_key, requester=None):
        if not api_key:
            raise Unavailable('Falta configurar la autenticación del servicio de pagos')
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.requester = requester or httpx.request
        # La instancia vive una solicitud: moneda y modo usan una misma configuración.
        self._configuration = None

    def request(self, method, path, schema, body=None):
        try:
            response = self.requester(method, self.base_url + path,
                headers={'Authorization': f'Bearer {self.api_key}'}, json=body,
                timeout=httpx.Timeout(5 if method == 'GET' else 35, connect=3))
        except httpx.HTTPError:
            # No se reintentan mutaciones: un timeout no prueba que la pasarela falló.
            raise Unavailable('El servicio de pagos no responde. Reintenta el mismo pedido.') from None
        if response.status_code == 401:
            raise Unavailable('No se pudo autorizar la operación con el servicio de pagos')
        errors = {403: Forbidden, 409: Conflict, 422: InvalidInput, 502: GatewayFailure, 503: Unavailable}
        if response.status_code in errors:
            messages = {403: 'Operación de pago no permitida en este entorno',
                        409: 'Este pedido pertenece a otro entorno de pagos',
                        422: 'El servicio de pagos rechazó los datos del pedido',
                        502: 'No se pudo verificar la respuesta de la pasarela. Reintenta el mismo pedido.',
                        503: 'El servicio de pagos no está disponible. Reintenta el mismo pedido.'}
            raise errors[response.status_code](messages[response.status_code])
        if response.status_code != 200:
            raise GatewayFailure('Respuesta inesperada del servicio de pagos')
        try:
            return schema.model_validate(response.json())
        except (ValueError, ValidationError):
            raise GatewayFailure('Respuesta inválida del servicio de pagos') from None

    def configuration(self):
        if self._configuration is None:
            self._configuration = self.request('GET', '/v1/config', PaymentConfiguration).model_dump()
        return self._configuration

    def mode(self):
        return self.configuration()['mode']

    def usd_rate(self):
        return Decimal(self.configuration()['usdPerPen'])

    def start(self, order):
        result = self.request('POST', '/v1/payments/start', StartResult,
                              PaymentOrder.from_record(order).model_dump(mode='json'))
        return result.reference, result.url

    def verify(self, order, capture=False):
        result = self.request('POST', '/v1/payments/verify', VerifyResult, {
            'order': PaymentOrder.from_record(order).model_dump(mode='json'), 'capture': capture,
        })
        return result.payment_id
