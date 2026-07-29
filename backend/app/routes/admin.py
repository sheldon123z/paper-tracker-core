from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user, require_manager
from ..auth.password import hash_password, validate_password_strength
from ..control_plane.database import get_control_db
from ..control_plane.models import AuditEvent, Department, User, UserSession
from ..database import get_db
from ..models import LLMUsageLog
from ..services.audit import write_audit_event

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_manager)])
activity_router = APIRouter(prefix="/api/activity", tags=["activity"])


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=128)


class DepartmentPatch(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=128)
    status: str | None = Field(default=None, pattern=r"^(active|disabled)$")


class UserCreate(BaseModel):
    email: str
    username: str = Field(max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    display_name: str | None = Field(default=None, max_length=128)
    temporary_password: str
    role: str = Field(default="user", pattern=r"^(manager|user)$")
    department_id: int | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.lower().strip()
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", value):
            raise ValueError("Invalid email format")
        return value

    @field_validator("username")
    @classmethod
    def validate_username_length(cls, value: str) -> str:
        if len(value) < 3:
            raise ValueError("至少包含三个字符")
        return value

    @field_validator("display_name")
    @classmethod
    def validate_display_name_length(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        if len(value) < 3:
            raise ValueError("至少包含三个字符")
        return value


class UserPatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    status: str | None = Field(default=None, pattern=r"^(active|disabled)$")
    role: str | None = Field(default=None, pattern=r"^(manager|user)$")
    department_id: int | None = None


class PasswordReset(BaseModel):
    temporary_password: str


class ActivityEvent(BaseModel):
    event_type: str = Field(pattern=r"^(page_view|heartbeat)$")
    path: str = Field(max_length=512)


def _department_dict(d: Department) -> dict:
    return {
        "id": d.id,
        "code": d.code,
        "name": d.name,
        "status": d.status,
        "created_at": d.created_at,
        "updated_at": d.updated_at,
    }


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "display_name": u.display_name,
        "status": u.status,
        "role": u.role,
        "department_id": u.department_id,
        "department_name": u.department.name if u.department else None,
        "must_change_password": u.must_change_password,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
    }


def _validate_department(db: Session, department_id: int | None, *, required: bool) -> Department | None:
    if department_id is None:
        if required:
            raise HTTPException(status_code=400, detail="创建部门账号时必须选择一个具体部门")
        return None
    department = db.query(Department).filter(Department.id == department_id).first()
    if department is None:
        raise HTTPException(status_code=400, detail="所选部门不存在")
    if department.status != "active":
        raise HTTPException(status_code=400, detail="所选部门已停用")
    return department


@router.get("/departments")
def list_departments(db: Session = Depends(get_control_db)):
    return [_department_dict(d) for d in db.query(Department).order_by(Department.name).all()]


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(
    body: DepartmentCreate,
    request: Request,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_control_db),
):
    if db.query(Department).filter((Department.code == body.code) | (Department.name == body.name)).first():
        raise HTTPException(status_code=409, detail="Department code or name already exists")
    department = Department(code=body.code, name=body.name)
    db.add(department)
    db.commit()
    db.refresh(department)
    write_audit_event(
        db,
        event_type="admin.department.created",
        request=request,
        actor=manager,
        resource_type="department",
        resource_id=department.id,
    )
    return _department_dict(department)


@router.patch("/departments/{department_id}")
def update_department(
    department_id: int,
    body: DepartmentPatch,
    request: Request,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_control_db),
):
    department = db.query(Department).filter(Department.id == department_id).first()
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    values = body.model_dump(exclude_unset=True)
    if (
        "code" in values
        and db.query(Department)
        .filter(
            Department.code == values["code"],
            Department.id != department_id,
        )
        .first()
    ):
        raise HTTPException(status_code=409, detail="Department code already exists")
    if (
        "name" in values
        and db.query(Department)
        .filter(
            Department.name == values["name"],
            Department.id != department_id,
        )
        .first()
    ):
        raise HTTPException(status_code=409, detail="Department name already exists")
    for key, value in values.items():
        setattr(department, key, value)
    db.commit()
    db.refresh(department)
    write_audit_event(
        db,
        event_type="admin.department.updated",
        request=request,
        actor=manager,
        resource_type="department",
        resource_id=department.id,
    )
    return _department_dict(department)


@router.get("/users")
def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    department_id: int | None = None,
    role: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_control_db),
):
    query = db.query(User)
    if department_id is not None:
        query = query.filter(User.department_id == department_id)
    if role:
        query = query.filter(User.role == role)
    if status_filter:
        query = query.filter(User.status == status_filter)
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": [_user_dict(u) for u in users], "meta": {"total": total, "page": page, "size": size}}


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate, request: Request, manager: User = Depends(require_manager), db: Session = Depends(get_control_db)
):
    email = body.email
    if db.query(User).filter((User.email == email) | (User.username == body.username)).first():
        raise HTTPException(status_code=409, detail="Email or username already exists")
    try:
        validate_password_strength(body.temporary_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _validate_department(db, body.department_id, required=body.role == "user")
    user = User(
        email=email,
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.temporary_password),
        role=body.role,
        department_id=body.department_id if body.role == "user" else None,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    write_audit_event(
        db,
        event_type="admin.user.created",
        request=request,
        actor=manager,
        subject_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
    )
    return _user_dict(user)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UserPatch,
    request: Request,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_control_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    values = body.model_dump(exclude_unset=True)
    next_role = values.get("role", user.role)
    next_department = values.get("department_id", user.department_id)
    if next_role == "user":
        _validate_department(db, next_department, required=True)
    if user.id == manager.id and values.get("status") == "disabled":
        raise HTTPException(status_code=400, detail="You cannot disable your own account")
    for key, value in values.items():
        setattr(user, key, value)
    if next_role == "manager":
        user.department_id = None
    if values.get("status") == "disabled":
        db.query(UserSession).filter(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        ).update({"revoked_at": datetime.now(UTC)}, synchronize_session=False)
    db.commit()
    db.refresh(user)
    write_audit_event(
        db,
        event_type="admin.user.updated",
        request=request,
        actor=manager,
        subject_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
    )
    return _user_dict(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int, request: Request, manager: User = Depends(require_manager), db: Session = Depends(get_control_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == manager.id:
        raise HTTPException(status_code=400, detail="不能注销当前登录的管理员账号")

    deleted_user_id = user.id
    db.query(AuditEvent).filter(AuditEvent.actor_user_id == deleted_user_id).update(
        {"actor_user_id": None},
        synchronize_session=False,
    )
    db.delete(user)
    db.commit()
    write_audit_event(
        db,
        event_type="admin.user.deleted",
        request=request,
        actor=manager,
        subject_user_id=deleted_user_id,
        resource_type="user",
        resource_id=deleted_user_id,
    )
    return {"message": "Account deleted", "user_id": deleted_user_id}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    body: PasswordReset,
    request: Request,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_control_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        validate_password_strength(body.temporary_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    user.password_hash = hash_password(body.temporary_password)
    user.must_change_password = True
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.revoked_at.is_(None)).update(
        {"revoked_at": datetime.now(UTC)}, synchronize_session=False
    )
    db.commit()
    write_audit_event(
        db,
        event_type="admin.user.password_reset",
        request=request,
        actor=manager,
        subject_user_id=user.id,
        resource_type="user",
        resource_id=user.id,
    )
    return {"message": "Password reset; all sessions revoked"}


@router.get("/sessions")
def list_sessions(user_id: int | None = None, db: Session = Depends(get_control_db)):
    query = db.query(UserSession, User).join(User, User.id == UserSession.user_id)
    if user_id is not None:
        query = query.filter(UserSession.user_id == user_id)
    rows = query.order_by(UserSession.created_at.desc()).limit(500).all()
    now = datetime.now(UTC)
    return [
        {
            "id": s.id,
            "user_id": u.id,
            "email": u.email,
            "department_id": u.department_id,
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": s.created_at,
            "expires_at": s.expires_at,
            "revoked_at": s.revoked_at,
            "active": s.revoked_at is None
            and (s.expires_at.replace(tzinfo=UTC) if s.expires_at.tzinfo is None else s.expires_at) > now,
        }
        for s, u in rows
    ]


@router.post("/sessions/{session_id}/revoke")
def revoke_session(
    session_id: int, request: Request, manager: User = Depends(require_manager), db: Session = Depends(get_control_db)
):
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.revoked_at = datetime.now(UTC)
    db.commit()
    write_audit_event(
        db,
        event_type="admin.session.revoked",
        request=request,
        actor=manager,
        subject_user_id=session.user_id,
        resource_type="session",
        resource_id=session.id,
    )
    return {"message": "Session revoked"}


@router.get("/audit")
def list_audit(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    user_id: int | None = None,
    department_id: int | None = None,
    event_type: str | None = None,
    outcome: str | None = None,
    ip_address: str | None = None,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
    db: Session = Depends(get_control_db),
):
    query = db.query(AuditEvent)
    if user_id is not None:
        # 系统事件（如迁移中的自动提权）没有 actor，只有 subject。按账号检索时一并
        # 命中 subject_user_id，否则这类记录无法通过任何账号筛选到。
        query = query.filter(or_(AuditEvent.actor_user_id == user_id, AuditEvent.subject_user_id == user_id))
    if department_id is not None:
        query = query.filter(AuditEvent.department_id == department_id)
    if event_type:
        query = query.filter(AuditEvent.event_type.like(f"{event_type}%"))
    if outcome:
        query = query.filter(AuditEvent.outcome == outcome)
    if ip_address:
        query = query.filter(AuditEvent.ip_address == ip_address)
    if from_time:
        query = query.filter(AuditEvent.created_at >= from_time)
    if to_time:
        query = query.filter(AuditEvent.created_at <= to_time)
    total = query.count()
    items = query.order_by(AuditEvent.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {
        "items": [{c.name: getattr(e, c.name) for c in AuditEvent.__table__.columns} for e in items],
        "meta": {"total": total, "page": page, "size": size},
    }


@router.get("/usage")
def usage_by_account(
    days: int = Query(30, ge=1, le=3650),
    app_db: Session = Depends(get_db),
    control_db: Session = Depends(get_control_db),
):
    cutoff = datetime.now(UTC).replace(tzinfo=None).timestamp() - days * 86400
    cutoff_dt = datetime.fromtimestamp(cutoff, tz=UTC)
    llm_rows = (
        app_db.query(
            LLMUsageLog.user_id,
            LLMUsageLog.department_id,
            func.count(LLMUsageLog.id),
            func.coalesce(func.sum(LLMUsageLog.total_tokens), 0),
            func.coalesce(func.sum(LLMUsageLog.duration_ms), 0),
            func.sum(case((LLMUsageLog.status != "success", 1), else_=0)),
            func.max(LLMUsageLog.created_at),
        )
        .filter(LLMUsageLog.created_at >= cutoff_dt)
        .group_by(LLMUsageLog.user_id, LLMUsageLog.department_id)
        .all()
    )
    llm_by_user: dict[int, dict] = {}
    for row in llm_rows:
        if row[0] is None:
            continue
        aggregate = llm_by_user.setdefault(
            row[0],
            {
                "calls": 0,
                "total_tokens": 0,
                "duration_ms": 0,
                "error_count": 0,
                "last_used_at": None,
            },
        )
        aggregate["calls"] += row[2] or 0
        aggregate["total_tokens"] += row[3] or 0
        aggregate["duration_ms"] += row[4] or 0
        aggregate["error_count"] += row[5] or 0
        if row[6] is not None and (aggregate["last_used_at"] is None or row[6] > aggregate["last_used_at"]):
            aggregate["last_used_at"] = row[6]

    activity_rows = (
        control_db.query(
            AuditEvent.actor_user_id,
            func.max(AuditEvent.created_at),
            func.sum(case((AuditEvent.event_type == "activity.page_view", 1), else_=0)),
            func.sum(case((AuditEvent.event_type == "api.request", 1), else_=0)),
            func.sum(
                case(
                    (
                        (AuditEvent.event_type == "api.request")
                        & AuditEvent.path.like("/api/papers%")
                        & AuditEvent.method.in_(("POST", "PATCH", "DELETE")),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((AuditEvent.outcome != "success", 1), else_=0)),
        )
        .filter(
            AuditEvent.created_at >= cutoff_dt,
            AuditEvent.actor_user_id.is_not(None),
        )
        .group_by(AuditEvent.actor_user_id)
        .all()
    )
    activity_by_user = {row[0]: row for row in activity_rows}

    session_rows = (
        control_db.query(UserSession.user_id, func.count(UserSession.id))
        .filter(
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > datetime.now(UTC),
        )
        .group_by(UserSession.user_id)
        .all()
    )
    active_sessions = dict(session_rows)

    result = []
    users = control_db.query(User).order_by(User.department_id, User.email).all()
    for user in users:
        llm = llm_by_user.get(user.id)
        activity = activity_by_user.get(user.id)
        result.append(
            {
                "user_id": user.id,
                "email": user.email,
                "department_id": user.department_id,
                "department_name": user.department.name if user.department else None,
                "last_activity_at": activity[1] if activity else None,
                "active_sessions": active_sessions.get(user.id, 0),
                "page_views": (activity[2] or 0) if activity else 0,
                "api_requests": (activity[3] or 0) if activity else 0,
                "paper_operations": (activity[4] or 0) if activity else 0,
                "failed_requests": (activity[5] or 0) if activity else 0,
                "calls": llm["calls"] if llm else 0,
                "total_tokens": llm["total_tokens"] if llm else 0,
                "duration_ms": llm["duration_ms"] if llm else 0,
                "error_count": llm["error_count"] if llm else 0,
                "last_used_at": llm["last_used_at"] if llm else None,
            }
        )
    for llm in llm_rows:
        if llm[0] is None:
            result.append(
                {
                    "user_id": None,
                    "email": "历史未归属",
                    "department_id": llm[1],
                    "department_name": None,
                    "last_activity_at": None,
                    "active_sessions": 0,
                    "page_views": 0,
                    "api_requests": 0,
                    "paper_operations": 0,
                    "failed_requests": 0,
                    "calls": llm[2],
                    "total_tokens": llm[3],
                    "duration_ms": llm[4],
                    "error_count": llm[5] or 0,
                    "last_used_at": llm[6],
                }
            )
    return result


@activity_router.post("")
def record_activity(
    body: ActivityEvent, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_control_db)
):
    write_audit_event(
        db,
        event_type=f"activity.{body.event_type}",
        request=request,
        actor=user,
        path_override=body.path,
    )
    return {"ok": True}
