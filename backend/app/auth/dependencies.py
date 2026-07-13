import hmac
import os

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from ..control_plane.database import get_control_db
from ..control_plane.models import User
from .tokens import decode_access_token

# OAuth2 scheme still used as fallback for Authorization header (API/MCP callers)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


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
    return user


def _is_loopback(request: Request) -> bool:
    """Strictly check whether the direct TCP peer is a loopback client.

    Only the exact strings ``127.0.0.1`` / ``::1`` / ``localhost`` are accepted.
    We deliberately do **not** use ``ipaddress.ip_address().is_loopback`` (which
    would match the whole ``127.0.0.0/8`` block) nor any startswith heuristic,
    so reverse proxies / Docker bridges that forward a real client IP cannot be
    spoofed into looking like loopback.
    """
    host = request.client.host if request.client else None
    return host in ("127.0.0.1", "::1", "localhost")


def get_current_user_or_service(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
    db: Session = Depends(get_control_db),
) -> User | None:
    """Allow either a regular JWT user or a service / loopback caller.

    Resolution order:

    1. **Service token bypass** — gated by ``PAPER_TRACKER_SERVICE_TOKEN`` env
       var. Used by remote integrations / public deployments where the caller
       cannot be on loopback. If the env var is unset or empty, the bypass is
       disabled.
    2. **Loopback bypass** — when the request comes directly from this host
       (``127.0.0.1`` / ``::1`` / ``localhost``) authentication is skipped to
       keep local development and the bundled ``mcp_server`` ergonomic. Set
       ``PAPER_TRACKER_DISABLE_LOOPBACK_BYPASS=1`` (production / public
       deployments) to turn this off.
    3. **JWT** — falls back to the regular cookie / Authorization header flow.

    In bypass modes ``request.state.is_service_call`` is set to ``True`` and
    ``None`` is returned (no user context).
    """
    # 1. Service token bypass (remote / public deployments)
    expected = os.getenv("PAPER_TRACKER_SERVICE_TOKEN", "").strip()
    if expected and x_service_token and hmac.compare_digest(x_service_token.strip(), expected):
        request.state.is_service_call = True
        return None

    # 2. Loopback bypass (local-only — mcp_server / dev convenience).
    #    Disable explicitly via PAPER_TRACKER_DISABLE_LOOPBACK_BYPASS=1.
    disable_loopback = os.getenv("PAPER_TRACKER_DISABLE_LOOPBACK_BYPASS", "").strip().lower()
    if disable_loopback not in {"1", "true", "yes"} and _is_loopback(request):
        request.state.is_service_call = True
        return None

    # 3. Regular JWT path
    return get_current_user(request, token, db)
