from __future__ import annotations

import hmac
import ipaddress
import logging
import os

from fastapi import Header, HTTPException, Request, status
from jwt import InvalidTokenError

logger = logging.getLogger("paper-tracker.security")


def _is_loopback_client(host: str | None) -> bool:
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host.lower() == "localhost"


def _is_private_network_client(host: str | None) -> bool:
    """Return True if client IP is in a private/LAN network (192.168.x.x, 10.x.x.x, 172.16-31.x.x)."""
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_private
    except ValueError:
        return False


def _extract_admin_token(authorization: str | None, x_llm_admin_token: str | None) -> str | None:
    if x_llm_admin_token:
        return x_llm_admin_token.strip()
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def _extract_jwt_token(request: Request | None = None, authorization: str | None = None) -> str | None:
    """Extract JWT token from cookie or Authorization header (cookie takes priority)."""
    # 1. Try httpOnly cookie
    if request is not None:
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            return cookie_token.strip()

    # 2. Fall back to Authorization header
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None

    # Avoid confusing the admin token with a JWT
    expected_admin_token = os.getenv("LLM_CONFIG_ADMIN_TOKEN", "").strip()
    if expected_admin_token and hmac.compare_digest(value.strip(), expected_admin_token):
        return None

    return value.strip()


def _is_valid_jwt(authorization: str | None, request: Request | None = None) -> bool:
    """Check if a valid JWT access token is present (cookie or Authorization header)."""
    token = _extract_jwt_token(request=request, authorization=authorization)
    if not token:
        return False

    try:
        from .auth.tokens import decode_access_token
        payload = decode_access_token(token)
        return bool(payload.get("sub"))
    except (InvalidTokenError, Exception):
        return False


def require_llm_config_access(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_llm_admin_token: str | None = Header(default=None, alias="X-LLM-Admin-Token"),
) -> None:
    # 1. JWT auth: if a valid JWT access token is present (cookie or header), allow access
    if _is_valid_jwt(authorization, request=request):
        return

    # 2. Admin token: static token for API/script access (backward compat)
    expected_token = os.getenv("LLM_CONFIG_ADMIN_TOKEN", "").strip()
    supplied_token = _extract_admin_token(authorization, x_llm_admin_token)

    if expected_token:
        if supplied_token and hmac.compare_digest(supplied_token, expected_token):
            return
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LLM config endpoints require a valid admin token.",
        )

    # 3. Localhost / LAN IP bypass
    client_host = request.client.host if request.client else None

    # Trust loopback (localhost) — always allowed
    if _is_loopback_client(client_host):
        return

    # Trust LAN / private network — controlled by LLM_CONFIG_TRUST_LAN (default: true)
    trust_lan = os.getenv("LLM_CONFIG_TRUST_LAN", "true").strip().lower()
    if trust_lan not in {"0", "false", "no", "off"} and _is_private_network_client(client_host):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="LLM config endpoints require authentication, local/LAN access, or LLM_CONFIG_ADMIN_TOKEN.",
    )
