"""Autenticación y errores HTTP compartidos por las dos aplicaciones ASGI."""
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from domain.errors import BusinessError, Conflict, Forbidden, GatewayFailure, InvalidInput, NotFound, Unavailable

bearer = HTTPBearer(auto_error=False)


def require_admin(request: Request,
                  credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or not secrets.compare_digest(
        credentials.credentials.encode(), request.app.state.api_key.encode()
    ):
        raise HTTPException(401, 'Credenciales inválidas', headers={'WWW-Authenticate': 'Bearer'})


def business_error_handler(request: Request, error: BusinessError):
    statuses = {InvalidInput: 422, NotFound: 404, Conflict: 409,
                Forbidden: 403, Unavailable: 503, GatewayFailure: 502}
    return JSONResponse(status_code=statuses[type(error)], content={'detail': str(error)})
