"""Application errors and the error envelope.

Every error response has the shape:
    {"error": {"code": "...", "message": "...", "details": ...}}
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import REQUEST_ID_HEADER, get_logger

logger = get_logger("errors")

GENERIC_500_MESSAGE = "Something went wrong on our side. Please try again."

_HTTP_ERROR_CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    415: "unsupported_media_type",
    429: "rate_limited",
}


class AppError(Exception):
    """An expected error with a stable code and a message that is safe to show users."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


async def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(
        status_code=exc.status,
        content=error_body(exc.code, exc.message, exc.details),
    )


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    code = _HTTP_ERROR_CODES.get(exc.status_code, "http_error")
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(code, message),
        headers=getattr(exc, "headers", None),
    )


_LOCATION_PREFIXES = {"body", "query", "path", "header", "cookie"}


def _field_name(loc: tuple[Any, ...]) -> str:
    # loc looks like ("body", "email") or ("query", "page"); drop the source part.
    parts = loc[1:] if len(loc) > 1 and loc[0] in _LOCATION_PREFIXES else loc
    return ".".join(str(p) for p in parts) or "request"


async def _handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    fields: dict[str, str] = {}
    for err in exc.errors():
        fields.setdefault(_field_name(tuple(err.get("loc", ()))), str(err.get("msg", "Invalid")))
    return JSONResponse(
        status_code=422,
        content=error_body("validation_error", "Some fields are invalid.", {"fields": fields}),
    )


async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # Runs in Starlette's outermost error middleware, so the request id middleware has
    # already finished: read the id from request.state and set the header here.
    request_id = _request_id(request)
    logger.error(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
        extra={"request_id": request_id or "-"},
    )
    headers = {REQUEST_ID_HEADER: request_id} if request_id else None
    return JSONResponse(
        status_code=500,
        content=error_body("internal_error", GENERIC_500_MESSAGE, {"request_id": request_id}),
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
