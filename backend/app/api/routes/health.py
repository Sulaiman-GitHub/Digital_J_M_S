from fastapi import APIRouter

from app.api.deps import DbSession
from app.core.errors import AppError
from app.db.health import check_database

router = APIRouter(tags=["health"])


@router.get("/health")
def health(session: DbSession) -> dict[str, dict[str, str]]:
    if not check_database(session):
        raise AppError(
            "database_unavailable",
            "The service is temporarily unavailable. Please try again shortly.",
            status=503,
        )
    return {"data": {"status": "ok", "database": "ok"}}
