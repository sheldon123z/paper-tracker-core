from __future__ import annotations

import hmac
import ipaddress
import logging
import os

from fastapi import Depends, Header, HTTPException, Request, status

from .auth.dependencies import get_optional_user
from .control_plane.models import User
from .offline import is_offline_mode
from .services.access_control import is_manager
from .settings import get_secret_value

logger = logging.getLogger("paper-tracker.security")

_TRUE_VALUES = {"1", "true", "yes", "on"}


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


def _is_explicit_development_mode() -> bool:
    """Return whether intentionally insecure local development fallbacks are enabled.

    A source IP is not an authentication boundary: behind a reverse proxy every
    browser can appear to come from the proxy's loopback/private address.  The
    fallback is therefore opt-in and is never honored by the offline runtime.
    """

    return (
        not is_offline_mode()
        and os.getenv("PAPER_TRACKER_DEV_MODE", "").strip().lower() in _TRUE_VALUES
    )


def _has_valid_admin_token(
    authorization: str | None,
    x_llm_admin_token: str | None,
) -> tuple[bool, bool]:
    """Return ``(is_configured, is_valid)`` for the static management token."""

    expected_token = (get_secret_value("LLM_CONFIG_ADMIN_TOKEN", "") or "").strip()
    supplied_token = _extract_admin_token(authorization, x_llm_admin_token)
    return (
        bool(expected_token),
        bool(
            expected_token
            and supplied_token
            and hmac.compare_digest(supplied_token, expected_token)
        ),
    )


def _development_client_fallback_allowed(request: Request) -> bool:
    if not _is_explicit_development_mode():
        return False
    client_host = request.client.host if request.client else None
    return _is_loopback_client(client_host) or _is_private_network_client(client_host)


def require_llm_config_access(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_llm_admin_token: str | None = Header(default=None, alias="X-LLM-Admin-Token"),
    authenticated_user: User | None = Depends(get_optional_user),
) -> None:
    # Reuse the session-aware auth dependency so logout, account disablement,
    # and session expiry take effect immediately instead of accepting a merely
    # well-signed JWT until its access-token expiry.
    if authenticated_user is not None and not getattr(
        authenticated_user,
        "must_change_password",
        False,
    ):
        return

    # Static token remains supported for API/script callers and existing
    # offline bundles.  It is deliberately checked independently of source IP.
    token_configured, token_valid = _has_valid_admin_token(
        authorization,
        x_llm_admin_token,
    )
    if token_valid:
        return
    if authenticated_user is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    if token_configured:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LLM config endpoints require a valid admin token.",
        )

    if _development_client_fallback_allowed(request):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "LLM config endpoints require an authenticated session or "
            "LLM_CONFIG_ADMIN_TOKEN."
        ),
    )


def require_llm_config_manager_access(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_llm_admin_token: str | None = Header(default=None, alias="X-LLM-Admin-Token"),
    authenticated_user: User | None = Depends(get_optional_user),
) -> None:
    """Restrict LLM configuration management to managers or the static token."""

    if (
        is_manager(authenticated_user)
        and not getattr(authenticated_user, "must_change_password", False)
    ):
        return

    token_configured, token_valid = _has_valid_admin_token(
        authorization,
        x_llm_admin_token,
    )
    if token_valid:
        return
    if authenticated_user is not None:
        detail = (
            "Password change required"
            if getattr(authenticated_user, "must_change_password", False)
            else "Manager access required"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    if token_configured:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="LLM config management requires a valid admin token.",
        )

    if _development_client_fallback_allowed(request):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="LLM config management requires a manager session or LLM_CONFIG_ADMIN_TOKEN.",
    )
