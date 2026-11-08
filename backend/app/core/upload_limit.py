"""Stop oversized uploads early.

Starlette reads a whole multipart upload into a temporary file before the route runs, so a
5 MB limit checked in the route would only be applied after a 500 MB upload had been received.
This middleware refuses by the declared Content-Length before reading anything, and also counts
the bytes of uploads that declare no length, for one path and method only.
"""

from collections.abc import Callable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import AppError, error_body

# Multipart boundaries and the other form fields add a little to the file's own size.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def _too_large_error(limit_bytes: int) -> AppError:
    megabytes = limit_bytes / (1024 * 1024)
    return AppError(
        "file_too_large", f"This file is too big. The limit is {megabytes:g} MB.", status=413
    )


class UploadSizeLimitMiddleware:
    def __init__(
        self, app: ASGIApp, *, path: str, method: str, max_file_bytes: Callable[[], int]
    ) -> None:
        self.app = app
        self.path = path
        self.method = method
        self.max_file_bytes = max_file_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != self.method or scope["path"] != self.path:
            await self.app(scope, receive, send)
            return

        file_limit = self.max_file_bytes()
        body_limit = file_limit + MULTIPART_OVERHEAD_BYTES

        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > body_limit:
            error = _too_large_error(file_limit)
            response = JSONResponse(
                status_code=error.status, content=error_body(error.code, error.message)
            )
            await response(scope, receive, send)
            return

        received = 0

        async def counting_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > body_limit:
                    raise _too_large_error(file_limit)  # becomes the 413 error response
            return message

        await self.app(scope, counting_receive, send)
