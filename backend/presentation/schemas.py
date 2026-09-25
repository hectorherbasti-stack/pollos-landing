from decimal import Decimal
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from domain.orders import Customer as CustomerValue, NewOrder as OrderCommand, OrderLine


class SaleInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    productId: Annotated[int, Field(strict=True, gt=0, le=9223372036854775807)]
    quantity: Annotated[Decimal, Field(gt=0, le=1000, decimal_places=2, allow_inf_nan=False)]


class Customer(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=2, max_length=100)]
    email: Annotated[str, Field(max_length=200, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')]
    phone: Annotated[str, Field(pattern=r'^\+?[0-9 ()-]{7,20}$')]


class NewOrder(BaseModel):
    model_config = ConfigDict(extra='forbid')
    requestKey: UUID
    items: Annotated[list[SaleInput], Field(min_length=1, max_length=50)]
    customer: Customer
    paymentMethod: Literal['paypal', 'yape', 'visa']

    def command(self):
        return OrderCommand(self.requestKey,
                            tuple(OrderLine(item.productId, item.quantity) for item in self.items),
                            CustomerValue(self.customer.name, self.customer.email, self.customer.phone),
                            self.paymentMethod)

    def digest(self):
        # Mantiene compatibilidad con las claves de pedidos guardadas antes del refactor.
        return sha256(self.model_dump_json().encode()).hexdigest()


class DemoResult(BaseModel):
    model_config = ConfigDict(extra='forbid')
    outcome: Literal['approved', 'declined', 'cancelled']
