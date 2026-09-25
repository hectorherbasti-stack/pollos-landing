"""Valores y reglas monetarias. Todos los importes se expresan en céntimos."""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from domain.errors import InvalidInput


def validate_quantity(quantity: Decimal) -> None:
    if (not quantity.is_finite() or not 0 < quantity <= 1000
            or quantity != quantity.quantize(Decimal('0.01'))):
        raise InvalidInput('La cantidad debe ser mayor que cero, hasta 1000 y con dos decimales')


def validate_product_id(product_id: int) -> None:
    if type(product_id) is not int or not 0 < product_id <= 9223372036854775807:
        raise InvalidInput('Producto inválido')


@dataclass(frozen=True)
class OrderLine:
    product_id: int
    quantity: Decimal

    def __post_init__(self):
        validate_product_id(self.product_id)
        validate_quantity(self.quantity)


@dataclass(frozen=True)
class Customer:
    name: str
    email: str
    phone: str


@dataclass(frozen=True)
class NewOrder:
    request_key: UUID
    items: tuple[OrderLine, ...]
    customer: Customer
    payment_method: str

    def validate(self) -> None:
        if not 1 <= len(self.items) <= 50:
            raise InvalidInput('El pedido debe contener entre 1 y 50 productos')
        if len({line.product_id for line in self.items}) != len(self.items):
            raise InvalidInput('Agrupa las cantidades de cada producto en una sola línea')


def line_total(price_cents: int, quantity: Decimal) -> int:
    validate_quantity(quantity)
    return int((price_cents * quantity).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def validate_total(total: int) -> None:
    if not 0 < total <= 100000000:
        raise InvalidInput('El importe del pedido está fuera del límite permitido')


def converted_total(total: int, rate: Decimal) -> int:
    charge = int((total * rate).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    if charge < 1:
        raise InvalidInput('El importe convertido es demasiado pequeño')
    return charge
