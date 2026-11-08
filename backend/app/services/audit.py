import uuid
from ipaddress import IPv4Address, IPv6Address, ip_address
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditEvent


def parse_ip(value: str | None) -> IPv4Address | IPv6Address | None:
    """The client address as an IP object, or None if missing or not an IP (e.g. test clients)."""
    if not value:
        return None
    try:
        return ip_address(value)
    except ValueError:
        return None


def record_event(
    db: Session,
    action: str,
    *,
    actor_user_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditEvent:
    """Add a security event. Never pass passwords, tokens or CV contents."""
    event = AuditEvent(
        action=action,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_metadata=metadata or {},
        ip_address=parse_ip(ip),
    )
    db.add(event)
    return event
