from datetime import UTC, datetime
import secrets
import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_user
from ..auth.password import hash_password, validate_password_strength, verify_password
from ..auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from ..auth.tokens import (
    _get_access_expire_minutes,
    _get_refresh_expire_days,
    create_access_token,
    create_refresh_token,
    get_refresh_token_expiry,
    hash_refresh_token,
)
from ..control_plane.database import get_control_db
from ..control_plane.models import User, UserSession
from ..services.audit import write_audit_event
from . import limiter  # shared rate limiter instance


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    """Set httpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,  # local dev; set True in production
        samesite="lax",
        max_age=_get_access_expire_minutes() * 60,
        path="/api",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=_get_refresh_expire_days() * 24 * 3600,
        path="/api/auth",
    )


def _clear_auth_cookies(response: JSONResponse) -> None:
    """Delete httpOnly auth cookies."""
    response.delete_cookie(key="access_token", path="/api")
    response.delete_cookie(key="refresh_token", path="/api/auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_control_db)):
    """Public registration is disabled; managers provision accounts."""
    allow_registration = os.getenv("PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION", "").strip().lower()
    if allow_registration not in {"1", "true", "yes"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Public registration is disabled")
    # Validate password strength
    try:
        validate_password_strength(body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # Check email uniqueness
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Check username uniqueness
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_control_db)):
    """Authenticate and receive access + refresh tokens."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        write_audit_event(
            db, event_type="auth.login", outcome="failure", request=request,
            metadata={"email": body.email.lower().strip()},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.status != "active":
        write_audit_event(db, event_type="auth.login", outcome="blocked", request=request, actor=user)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    session_key = secrets.token_urlsafe(32)
    refresh_token = create_refresh_token()

    # Store refresh token session
    session = UserSession(
        user_id=user.id,
        session_key=session_key,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=get_refresh_token_expiry(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(session)

    # Update last login
    user.last_login_at = datetime.now(UTC)
    db.commit()
    access_token, _ = create_access_token(user.id, user.email, user.role, session_key)
    request.state.session_key = session_key
    write_audit_event(db, event_type="auth.login", request=request, actor=user)

    # Return user info in body; tokens go in httpOnly cookies
    user_data = {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "status": user.status,
        "role": user.role,
        "department_id": user.department_id,
        "must_change_password": user.must_change_password,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
    response = JSONResponse(content={
        "message": "登录成功",
        "user": user_data,
        "expires_in": _get_access_expire_minutes() * 60,
    })
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.post("/token", response_model=TokenResponse)
@limiter.limit("10/minute")
def issue_bearer_token(request: Request, body: LoginRequest, db: Session = Depends(get_control_db)):
    """Issue a user-scoped bearer token pair for MCP and non-browser clients."""
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        write_audit_event(db, event_type="auth.token", outcome="failure", request=request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.status != "active":
        write_audit_event(db, event_type="auth.token", outcome="blocked", request=request, actor=user)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    session_key = secrets.token_urlsafe(32)
    refresh_token = create_refresh_token()
    db.add(UserSession(
        user_id=user.id,
        session_key=session_key,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=get_refresh_token_expiry(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    user.last_login_at = datetime.now(UTC)
    db.commit()
    access_token, _ = create_access_token(user.id, user.email, user.role, session_key)
    request.state.session_key = session_key
    write_audit_event(db, event_type="auth.token", request=request, actor=user)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=_get_access_expire_minutes() * 60,
    )


@router.post("/logout")
def logout(
    request: Request,
    body: RefreshRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_control_db),
):
    """Revoke a refresh token (logout) and clear auth cookies."""
    # Read refresh token from cookie first, then body (backward compat for API callers)
    raw_refresh = request.cookies.get("refresh_token") or (body.refresh_token if body else None)

    session_key = getattr(request.state, "session_key", None)
    if session_key:
        session = db.query(UserSession).filter(
            UserSession.session_key == session_key,
            UserSession.user_id == current_user.id,
        ).first()
        if session:
            session.revoked_at = datetime.now(UTC)
            db.commit()
    elif raw_refresh:
        token_hash = hash_refresh_token(raw_refresh)
        session = (
            db.query(UserSession)
            .filter(
                UserSession.refresh_token_hash == token_hash,
                UserSession.user_id == current_user.id,
            )
            .first()
        )
        if session:
            session.revoked_at = datetime.now(UTC)
            db.commit()

    write_audit_event(db, event_type="auth.logout", request=request, actor=current_user)

    response = JSONResponse(content={"message": "Logged out"})
    _clear_auth_cookies(response)
    return response


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh(request: Request, body: RefreshRequest | None = None, db: Session = Depends(get_control_db)):
    """Exchange a valid refresh token for a new token pair (cookie or body)."""
    # Read refresh token from cookie first, then body (backward compat for API callers)
    raw_refresh = request.cookies.get("refresh_token") or (body.refresh_token if body else None)

    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    token_hash = hash_refresh_token(raw_refresh)
    session = db.query(UserSession).filter(UserSession.refresh_token_hash == token_hash).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    if session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )
    # SQLite stores naive datetimes; ensure both sides are comparable
    expires_at = session.expires_at.replace(tzinfo=UTC) if session.expires_at.tzinfo is None else session.expires_at
    if expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is not active",
        )

    # Revoke old session
    session.revoked_at = datetime.now(UTC)

    # Create new tokens
    session_key = secrets.token_urlsafe(32)
    new_refresh_token = create_refresh_token()

    # Store new session
    new_session = UserSession(
        user_id=user.id,
        session_key=session_key,
        refresh_token_hash=hash_refresh_token(new_refresh_token),
        expires_at=get_refresh_token_expiry(),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(new_session)
    db.commit()
    access_token, _ = create_access_token(user.id, user.email, user.role, session_key)

    response = JSONResponse(content={
        "message": "Token refreshed",
        "expires_in": _get_access_expire_minutes() * 60,
    })
    _set_auth_cookies(response, access_token, new_refresh_token)
    return response


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user


@router.post("/change-password")
def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_control_db),
):
    """Change the current user's password."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    try:
        validate_password_strength(body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    write_audit_event(db, event_type="auth.password_changed", request=request, actor=current_user)
    return {"message": "Password changed"}
