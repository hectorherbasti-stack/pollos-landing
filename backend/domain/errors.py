"""Errores del negocio; el adaptador de entrada decide cómo representarlos."""


class BusinessError(Exception):
    pass


class InvalidInput(BusinessError):
    pass


class NotFound(BusinessError):
    pass


class Conflict(BusinessError):
    pass


class Forbidden(BusinessError):
    pass


class Unavailable(BusinessError):
    pass


class GatewayFailure(BusinessError):
    pass
