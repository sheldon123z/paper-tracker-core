import secrets
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import ControlBase


class Department(ControlBase):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(128), unique=True, index=True, nullable=False)
    status = Column(String(16), default="active", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    users = relationship("User", back_populates="department")


class User(ControlBase):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(256), unique=True, index=True, nullable=False)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    display_name = Column(String(128), nullable=True)
    status = Column(String(16), default="active", nullable=False)  # active, disabled, pending
    role = Column(String(16), default="user", nullable=False)  # manager, user (legacy admin values are migrated)
    department_id = Column(Integer, ForeignKey("departments.id"), index=True, nullable=True)
    must_change_password = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    department = relationship("Department", back_populates="users")


class UserSession(ControlBase):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    session_key = Column(String(64), unique=True, index=True, nullable=False, default=lambda: secrets.token_urlsafe(32))
    refresh_token_hash = Column(String(256), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")


class AuditEvent(ControlBase):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    subject_user_id = Column(Integer, nullable=True, index=True)
    department_id = Column(Integer, nullable=True, index=True)
    session_key = Column(String(64), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    outcome = Column(String(16), default="success", nullable=False, index=True)
    method = Column(String(16), nullable=True)
    path = Column(String(512), nullable=True, index=True)
    resource_type = Column(String(64), nullable=True, index=True)
    resource_id = Column(String(128), nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    metadata_json = Column(Text, default="{}", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("id", "created_at", name="uq_audit_event_id_created"),
    )
