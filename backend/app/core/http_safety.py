"""Security headers and a size limit for ordinary request bodies."""

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import AppError, error_body

# JSON bodies in this API are small. The CV upload has its own, larger limit.
DEFAULT_MAX_BODY_BYTES = 1024 * 1024

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")

_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}
# The API returns JSON and files, never pages: nothing may load or frame from it.
_API_CSP = "default-src 'none'; frame-ancestors 'none'"
_HSTS = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware:
    """Adds the standard protective headers to every response. HSTS only in production (it only
    means something over HTTPS). The interactive docs page needs scripts, so it gets no CSP."""

    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_docs = scope["path"].startswith(_DOCS_PATHS)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in _HEADERS.items():
                    headers.setdefault(name, value)
                if not is_docs:
                    headers.setdefault("Content-Security-Policy", _API_CSP)
                if self.hsts:
                    headers.setdefault("Strict-Transport-Security", _HSTS)
            await send(message)

        await self.app(scope, receive, send_with_headers)


class BodySizeLimitMiddleware:
    """Refuses request bodies over `max_bytes`, by the declared length first and then by counting
    (for bodies that declare none). Paths in `exempt_paths` have their own limit."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_bytes: int = DEFAULT_MAX_BODY_BYTES,
        exempt_paths: tuple[str, ...] = (),
    ) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.exempt_paths = exempt_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        error = AppError("payload_too_large", "This request is too large.", status=413)
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            response = JSONResponse(
                status_code=error.status, content=error_body(error.code, error.message)
            )
            await response(scope, receive, send)
            return

        received = 0
        exceeded = False
        answered = False

        async def counting_receive() -> Message:
            nonlocal received, exceeded
            if exceeded:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # Stop reading. Whatever the app does next, the answer is the 413 below.
                    exceeded = True
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal answered
            if not exceeded:
                await send(message)
                return
            if answered:
                return  # swallow the rest of whatever the app was going to say
            answered = True
            response = JSONResponse(
                status_code=error.status, content=error_body(error.code, error.message)
            )
            await response(scope, receive, send)

        await self.app(scope, counting_receive, guarded_send)
