from decimal import Decimal

from application.ports import CatalogRepository, SalesRepository
from domain.errors import NotFound
from domain.orders import validate_product_id, validate_quantity


class Catalog:
    def __init__(self, repository: CatalogRepository):
        self.repository = repository

    def list_products(self):
        # El caso de uso público nunca devuelve costos internos.
        fields = ('id', 'name', 'description', 'emoji', 'salePriceCents')
        return [{key: row[key] for key in fields} for row in self.repository.list_active()]


class Sales:
    def __init__(self, repository: SalesRepository):
        self.repository = repository

    def dashboard(self):
        return self.repository.dashboard()

    def record(self, product_id: int, quantity: Decimal):
        validate_product_id(product_id)
        validate_quantity(quantity)
        sale_id = self.repository.record(product_id, quantity)
        if sale_id is None:
            raise NotFound('Producto no encontrado o inactivo')
        return {'id': sale_id}
