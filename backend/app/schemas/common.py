"""Response envelopes, declared so /docs shows the real shapes."""

from typing import Any

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class DataResponse[T](BaseModel):
    data: T


class MessageOut(BaseModel):
    message: str


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int


class PagedResponse[T](BaseModel):
    """A list with its page details: {"data": [...], "meta": {"page", "page_size", "total"}}."""

    data: list[T]
    meta: PageMeta


def error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """`responses=` value documenting the error envelope (replaces FastAPI's default 422 shape)."""
    return {status: {"model": ErrorResponse} for status in statuses}
