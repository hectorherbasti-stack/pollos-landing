from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Header

from presentation.common import require_admin
from presentation.schemas import DemoResult, NewOrder, SaleInput

def create_router(catalog_dependency, sales_dependency, checkout_dependency, health_dependency, payments_dependency):
    router = APIRouter()
    Catalog = Annotated[object, Depends(catalog_dependency)]
    Sales = Annotated[object, Depends(sales_dependency)]
    Checkout = Annotated[object, Depends(checkout_dependency)]
    Payments = Annotated[object, Depends(payments_dependency)]
    Owner = Annotated[UUID, Header(alias='X-Checkout-Owner')]
    private = [Depends(require_admin)]

    @router.get('/health', dependencies=[Depends(health_dependency)])
    def health():
        return {'status': 'ok'}

    @router.get('/products')
    def products(service: Catalog):
        return service.list_products()

    @router.get('/dashboard', dependencies=private)
    def dashboard(service: Sales):
        return service.dashboard()

    @router.post('/sales', status_code=201, dependencies=private)
    def create_sale(body: SaleInput, service: Sales):
        return service.record(body.productId, body.quantity)

    @router.get('/checkout/config', dependencies=private)
    def config(payments: Payments):
        return payments.configuration()

    @router.post('/orders', status_code=201, dependencies=private)
    def new_order(body: NewOrder, service: Checkout, owner: Owner):
        return service.create(body.command(), owner, body.digest())

    @router.get('/orders/{order_id}', dependencies=private)
    def get_order(order_id: UUID, service: Checkout, owner: Owner):
        return service.get(order_id, owner)

    @router.post('/orders/{order_id}/pay', dependencies=private)
    def pay(order_id: UUID, service: Checkout, owner: Owner):
        return service.pay(order_id, owner)

    @router.post('/orders/{order_id}/confirm', dependencies=private)
    def confirm(order_id: UUID, service: Checkout, owner: Owner):
        return service.confirm(order_id, owner)

    @router.post('/orders/{order_id}/demo', dependencies=private)
    def simulate(order_id: UUID, body: DemoResult, service: Checkout, owner: Owner):
        return service.simulate(order_id, owner, body.outcome)

    @router.post('/checkout/reconcile', dependencies=private)
    def reconcile(service: Checkout):
        return service.reconcile()

    return router
