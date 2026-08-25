import hmac
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from ..control_plane.database import get_control_db
from ..control_plane.models import User, UserSession
from ..services.access_control import is_manager
from ..settings import get_secret_value
from .tokens import decode_access_token

# OAuth2 scheme still used as fallback for Authorization header (API/MCP callers)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def _resolve_token(request: Request, header_token: str | None) -> str | None:
    """Resolve JWT token: httpOnly cookie first, then Authorization header."""
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token.strip()
    return header_token


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_control_db),
) -> User:
    resolved = _resolve_token(request, token)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(resolved)
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    session_key = payload.get("sid")
    if not session_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session identity is missing")
    session = db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.session_key == session_key,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > datetime.now(UTC),
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has been revoked")
    if hasattr(request, "state"):
        request.state.session_key = session_key
    if hasattr(request, "state"):
        request.state.user = user
    if user.must_change_password and request.url.path not in {
        "/api/auth/me", "/api/auth/change-password", "/api/auth/logout"
    }:
        raise HTTPException(status_code=403, detail="Password change required")
    return user


def get_optional_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_control_db),
) -> User | None:
    resolved = _resolve_token(request, token)
    if not resolved:
        return None
    try:
        payload = decode_access_token(resolved)
    except InvalidTokenError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or user.status != "active":
        return None
    session_key = payload.get("sid")
    if not session_key or db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.session_key == session_key,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > datetime.now(UTC),
    ).first() is None:
        return None
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    if not is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager access required")
    return user


def get_current_user_or_ingestion_service(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
    db: Session = Depends(get_control_db),
) -> User | None:
    """Allow a JWT user or the explicit scheduler token; never trust loopback alone."""
    expected = (get_secret_value("PAPER_TRACKER_SERVICE_TOKEN", "") or "").strip()
    if expected and x_service_token and hmac.compare_digest(x_service_token.strip(), expected):
        request.state.is_service_call = True
        return None
    return get_current_user(request, token, db)
