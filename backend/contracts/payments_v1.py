"""DTO del protocolo interno v1. Nunca se envía el registro completo del pedido."""
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PaymentMode = Literal['demo', 'sandbox', 'live']
PaymentMethod = Literal['paypal', 'yape', 'visa']


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')


class PaymentOrder(Contract):
    id: UUID
    payment_mode: PaymentMode
    payment_method: PaymentMethod
    total_cents: Annotated[int, Field(strict=True, gt=0, le=100000000)]
    charge_cents: Annotated[int, Field(strict=True, gt=0, le=1000000000)]
    charge_currency: Literal['PEN', 'USD']
    customer_email: Annotated[str, Field(max_length=200, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')]
    provider_reference: Annotated[str | None, Field(min_length=1, max_length=200)] = None

    @model_validator(mode='after')
    def valid_currency(self):
        usd = self.payment_method == 'paypal' and self.payment_mode != 'demo'
        if self.charge_currency != ('USD' if usd else 'PEN'):
            raise ValueError('Moneda incompatible con el método y entorno')
        if not usd and self.charge_cents != self.total_cents:
            raise ValueError('El importe en PEN debe coincidir con el total')
        return self

    @classmethod
    def from_record(cls, order):
        return cls.model_validate({field: order.get(field) for field in cls.model_fields})


class VerifyRequest(Contract):
    order: PaymentOrder
    capture: Annotated[bool, Field(strict=True)] = False


class StartResult(Contract):
    reference: Annotated[str, Field(min_length=1, max_length=200)]
    url: Annotated[str, Field(min_length=1, max_length=8192)]

    @field_validator('url')
    @classmethod
    def https_url(cls, value):
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or not parsed.netloc:
            raise ValueError('El enlace de pago debe usar HTTPS')
        return value


class VerifyResult(Contract):
    payment_id: Annotated[str | None, Field(min_length=1, max_length=300)]


class PaymentOption(Contract):
    id: PaymentMethod
    name: Annotated[str, Field(min_length=1, max_length=100)]
    available: Annotated[bool, Field(strict=True)]


class PaymentConfiguration(Contract):
    mode: PaymentMode
    usdPerPen: str
    methods: list[PaymentOption]

    @field_validator('usdPerPen')
    @classmethod
    def valid_rate(cls, value):
        try:
            rate = Decimal(value)
        except InvalidOperation:
            raise ValueError('Tipo de cambio inválido') from None
        if not rate.is_finite() or not 0 <= rate < 10:
            raise ValueError('Tipo de cambio inválido')
        return value

    @model_validator(mode='after')
    def supported_methods(self):
        if len(self.methods) != 3 or {method.id for method in self.methods} != {'paypal', 'yape', 'visa'}:
            raise ValueError('Configuración de métodos incompleta')
        return self
