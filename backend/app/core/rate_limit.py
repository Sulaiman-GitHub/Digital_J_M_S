"""Per-IP rate limiting with slowapi.

Counts are kept in memory, per server process. That is enough for the single-server pilot; with
several processes or servers, point slowapi at Redis. Behind a reverse proxy the client IP must
come from the proxy's forwarded header (Phase 6, deployment).
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.errors import error_body

RETRY_AFTER_SECONDS = 60

limiter = Limiter(key_func=get_remote_address, headers_enabled=False)


def auth_rate_limit() -> str:
    """Limit for the abusable auth endpoints, from AUTH_RATE_LIMIT (default 5/minute)."""
    return get_settings().auth_rate_limit


def upload_rate_limit() -> str:
    """Limit for file uploads, from UPLOAD_RATE_LIMIT (default 10/minute)."""
    return get_settings().upload_rate_limit


def report_rate_limit() -> str:
    """Limit for vacancy reports, from REPORT_RATE_LIMIT (default 10/hour)."""
    return get_settings().report_rate_limit


def apply_rate_limit() -> str:
    """Limit for applications, from APPLY_RATE_LIMIT (default 30/hour)."""
    return get_settings().apply_rate_limit


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content=error_body(
            "rate_limited", "Too many requests. Please wait a minute and try again."
        ),
        headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
    )
