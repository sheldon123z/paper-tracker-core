"""Central row-level access rules for public and department-scoped resources."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import and_, event, or_
from sqlalchemy.orm import Query, Session, with_loader_criteria

from ..control_plane.models import User
from ..models import Feed, Paper, PaperUserState, Tag

MANAGER_ROLES = {"manager", "admin", "super_admin"}


def is_manager(user: User | None) -> bool:
    return bool(user and getattr(user, "role", None) in MANAGER_ROLES)


def scope_session(db: Session, user: User) -> None:
    """Attach immutable access identity used by ORM selects inside AI tools."""
    db.info["access_scope"] = {
        "is_manager": is_manager(user),
        "department_id": getattr(user, "department_id", None),
        "user_id": user.id,
    }


@event.listens_for(Session, "do_orm_execute")
def _apply_session_scope(execute_state):
    scope = execute_state.session.info.get("access_scope")
    if not scope or scope["is_manager"] or not execute_state.is_select:
        return
    department_id = scope["department_id"]
    if department_id is None:
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(Paper, lambda cls: cls.visibility == "public", include_aliases=True),
            with_loader_criteria(Feed, lambda cls: cls.visibility == "public", include_aliases=True),
            with_loader_criteria(Tag, lambda cls: cls.visibility == "public", include_aliases=True),
        )
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            Paper,
            lambda cls: or_(cls.visibility == "public", cls.department_id == department_id),
            include_aliases=True,
        ),
        with_loader_criteria(
            Feed,
            lambda cls: or_(cls.visibility == "public", cls.department_id == department_id),
            include_aliases=True,
        ),
        with_loader_criteria(
            Tag,
            lambda cls: or_(cls.visibility == "public", cls.department_id == department_id),
            include_aliases=True,
        ),
    )


def require_department(user: User) -> int:
    if user.department_id is None:
        raise HTTPException(status_code=403, detail="Account has not been assigned to a department")
    if user.department is None or user.department.status != "active":
        raise HTTPException(status_code=403, detail="Account department is disabled")
    return int(user.department_id)


def visible_scope(model, user: User):
    if is_manager(user):
        return True
    department_id = require_department(user)
    return or_(model.visibility == "public", and_(model.visibility == "department", model.department_id == department_id))


def writable_scope(model, user: User):
    if is_manager(user):
        return True
    department_id = require_department(user)
    return and_(model.visibility == "department", model.department_id == department_id)


def filter_visible(query: Query, model, user: User) -> Query:
    predicate = visible_scope(model, user)
    return query if predicate is True else query.filter(predicate)


def get_visible_or_404(db: Session, model, resource_id: int, user: User):
    query = db.query(model).filter(model.id == resource_id)
    resource = filter_visible(query, model, user).first()
    if resource is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return resource


def require_writable(resource, user: User) -> None:
    if is_manager(user):
        return
    if resource.visibility != "department" or resource.department_id != user.department_id:
        raise HTTPException(status_code=403, detail="This resource is read-only for your account")


def normalize_new_scope(user: User, visibility: str | None, department_id: int | None) -> tuple[str, int | None]:
    if not is_manager(user):
        return "department", require_department(user)
    resolved_visibility = visibility or "public"
    if resolved_visibility not in {"public", "department"}:
        raise HTTPException(status_code=400, detail="visibility must be public or department")
    if resolved_visibility == "public":
        return "public", None
    if department_id is None:
        raise HTTPException(status_code=400, detail="department_id is required for department resources")
    return "department", int(department_id)


def get_user_state(
    db: Session, paper_id: int, user_id: int, *, create: bool = False, legacy_for_manager: bool = False,
) -> PaperUserState | None:
    state = db.query(PaperUserState).filter(
        PaperUserState.paper_id == paper_id,
        PaperUserState.user_id == user_id,
    ).first()
    if state is None and create:
        paper = db.query(Paper).filter(Paper.id == paper_id).first() if legacy_for_manager else None
        state = PaperUserState(
            paper_id=paper_id,
            user_id=user_id,
            is_read=bool(paper.is_read) if paper else False,
            is_favorited=bool(paper.is_favorited) if paper else False,
            notes=paper.notes or "" if paper else "",
        )
        db.add(state)
    return state


def paper_response(db: Session, paper: Paper, user: User) -> dict:
    state = get_user_state(db, paper.id, user.id)
    result = {column.name: getattr(paper, column.name) for column in Paper.__table__.columns}
    legacy_fallback = state is None and is_manager(user)
    result["is_read"] = bool(state.is_read) if state else (bool(paper.is_read) if legacy_fallback else False)
    result["is_favorited"] = bool(state.is_favorited) if state else (bool(paper.is_favorited) if legacy_fallback else False)
    result["notes"] = state.notes if state else (paper.notes if legacy_fallback else "")
    return result
