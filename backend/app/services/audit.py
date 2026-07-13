from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ..control_plane.models import AuditEvent, User

logger = logging.getLogger("paper-tracker.audit")


def write_audit_event(
    db: Session,
    *,
    event_type: str,
    outcome: str = "success",
    request: Request | None = None,
    actor: User | None = None,
    subject_user_id: int | None = None,
    resource_type: str | None = None,
    resource_id: str | int | None = None,
    path_override: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        event = AuditEvent(
            actor_user_id=getattr(actor, "id", None) if actor else None,
            subject_user_id=subject_user_id,
            department_id=getattr(actor, "department_id", None) if actor else None,
            session_key=getattr(getattr(request, "state", None), "session_key", None) if request else None,
            event_type=event_type,
            outcome=outcome,
            method=request.method if request else None,
            path=path_override if path_override is not None else (request.url.path if request else None),
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
        )
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to write audit event %s", event_type)
