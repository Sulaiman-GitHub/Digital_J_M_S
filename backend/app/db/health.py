from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.logging import get_logger

logger = get_logger("db.health")


def check_database(session: Session) -> bool:
    """True if the database answers SELECT 1. Errors are logged, never returned to clients."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        return False
    return True
