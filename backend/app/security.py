from __future__ import annotations

import hmac
import ipaddress
import logging
import os

from fastapi import Depends, Header, HTTPException, Request, status

from .auth.dependencies import get_optional_user
from .control_plane.models import User
from .settings import get_secret_value

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


def require_llm_config_access(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_llm_admin_token: str | None = Header(default=None, alias="X-LLM-Admin-Token"),
    authenticated_user: User | None = Depends(get_optional_user),
) -> None:
    # Reuse the session-aware auth dependency so logout, account disablement,
    # and session expiry take effect immediately instead of accepting a merely
    # well-signed JWT until its access-token expiry.
    if authenticated_user is not None:
        return

    # 2. Admin token: static token for API/script access (backward compat)
    expected_token = (get_secret_value("LLM_CONFIG_ADMIN_TOKEN", "") or "").strip()
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
