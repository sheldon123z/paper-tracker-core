from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..control_plane.models import User
from ..models import Paper, PaperUserState
from .access_control import MANAGER_ROLES

logger = logging.getLogger("paper-tracker.access-migration")


def migrate_legacy_personal_states(app_db: Session, control_db: Session) -> int:
    """Copy legacy shared read/favorite/note values to managers only, idempotently."""
    manager_ids = [row.id for row in control_db.query(User.id).filter(User.role.in_(MANAGER_ROLES)).all()]
    if not manager_ids:
        return 0
    papers = app_db.query(Paper).filter(
        (Paper.is_read.is_(True)) | (Paper.is_favorited.is_(True)) | (Paper.notes != "")
    ).all()
    created = 0
    for paper in papers:
        existing_ids = {
            row.user_id for row in app_db.query(PaperUserState.user_id).filter(
                PaperUserState.paper_id == paper.id,
                PaperUserState.user_id.in_(manager_ids),
            ).all()
        }
        for manager_id in manager_ids:
            if manager_id in existing_ids:
                continue
            app_db.add(PaperUserState(
                paper_id=paper.id,
                user_id=manager_id,
                is_read=bool(paper.is_read),
                is_favorited=bool(paper.is_favorited),
                notes=paper.notes or "",
            ))
            created += 1
    if created:
        app_db.commit()
        logger.info("Migrated %d legacy paper states to manager accounts", created)
    return created
