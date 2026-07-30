"""Central outbound-network policy for strict offline deployments.

``OFFLINE_MODE`` is deliberately enforced in service code as well as at HTTP
route boundaries.  This prevents background jobs, direct service calls, and
future callers from bypassing a UI-only or router-only guard.
"""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

OFFLINE_ERROR_CODE = "OFFLINE_MODE_BLOCKED"
_TRUE_VALUES = {"1", "true", "yes", "on"}
_DEFAULT_LLM_HOSTS = {
    "127.0.0.1",
    "::1",
}
_OFFLINE_NETWORKS = tuple(
    ipaddress.ip_network(cidr)
    for cidr in (
        "10.0.0.0/8",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
    )
)


class OfflineModeError(ValueError):
    """Raised when strict offline mode blocks an outbound capability."""

    code = OFFLINE_ERROR_CODE

    def __init__(self, feature: str, reason: str | None = None):
        self.feature = feature
        self.reason = reason
        message = f"{OFFLINE_ERROR_CODE}: {feature} is unavailable while OFFLINE_MODE is enabled."
        if reason:
            message = f"{message} {reason}"
        super().__init__(message)


def is_offline_mode() -> bool:
    """Return whether strict offline mode is enabled for this process."""

    return os.getenv("OFFLINE_MODE", "").strip().lower() in _TRUE_VALUES


def require_online(feature: str) -> None:
    """Reject an outbound-only feature when strict offline mode is enabled."""

    if is_offline_mode():
        raise OfflineModeError(
            feature,
            "Disable OFFLINE_MODE only in a deployment that permits outbound network access.",
        )


def require_online_http(feature: str) -> None:
    """HTTP boundary variant of :func:`require_online` with a clear 503."""

    if not is_offline_mode():
        return

    # Keep FastAPI out of module import time for service-only and CLI callers.
    from fastapi import HTTPException, status

    error = OfflineModeError(
        feature,
        "This deployment does not permit outbound network access.",
    )
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": error.code, "message": str(error)},
    )


def _normalise_host(host: str) -> str:
    return host.strip().lower().rstrip(".").strip("[]")


def _configured_llm_hosts() -> tuple[str, ...]:
    raw = os.getenv("OFFLINE_LLM_ALLOWED_HOSTS", "")
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def _is_offline_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(address in network for network in _OFFLINE_NETWORKS)


def _resolve_host_addresses(host: str) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    addresses: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        return addresses
    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        try:
            addresses.add(ipaddress.ip_address(sockaddr[0]))
        except ValueError:
            continue
    return addresses


def is_offline_llm_host_allowed(host: str | None) -> bool:
    """Return whether *host* is an explicitly offline-safe LLM endpoint.

    Only literal loopback IPs are built in.  ``OFFLINE_LLM_ALLOWED_HOSTS`` may
    add exact hostnames/IPs, CIDR ranges, or ``*.example.internal`` style
    suffixes.  A blanket ``*`` is never accepted.  Host aliases such as
    ``localhost`` and ``host.docker.internal`` must be opted into explicitly.
    """

    if not host:
        return False
    candidate = _normalise_host(host)

    try:
        candidate_ip = ipaddress.ip_address(candidate)
    except ValueError:
        candidate_ip = None

    if candidate in _DEFAULT_LLM_HOSTS:
        addresses = (
            {candidate_ip}
            if candidate_ip is not None
            else _resolve_host_addresses(candidate)
        )
        return bool(addresses) and all(
            _is_offline_address(address) for address in addresses
        )

    matched = False
    for raw_entry in _configured_llm_hosts():
        entry = _normalise_host(raw_entry)
        if not entry or entry == "*":
            continue

        if "/" in entry and candidate_ip is not None:
            try:
                if candidate_ip in ipaddress.ip_network(entry, strict=False):
                    matched = True
                    break
            except ValueError:
                continue

        if entry.startswith("*."):
            suffix = entry[2:]
            if candidate.endswith(f".{suffix}"):
                matched = True
                break
            continue
        if entry.startswith("."):
            suffix = entry[1:]
            if candidate == suffix or candidate.endswith(f".{suffix}"):
                matched = True
                break
            continue
        if candidate == entry:
            matched = True
            break

    if not matched:
        return False

    # An allowlist entry narrows names/ranges; it must never turn a public
    # target into an offline-safe one.  Fail closed on DNS errors or mixed
    # private/public responses to reduce DNS-rebinding exposure.
    addresses = {candidate_ip} if candidate_ip is not None else _resolve_host_addresses(candidate)
    return bool(addresses) and all(_is_offline_address(address) for address in addresses)


def require_offline_llm_endpoint(base_url: str | None) -> None:
    """In offline mode, require an explicit local or allowlisted LLM URL."""

    if not is_offline_mode():
        return
    if not base_url:
        raise OfflineModeError(
            "remote LLM access",
            "Configure an explicit loopback IP or OFFLINE_LLM_ALLOWED_HOSTS endpoint.",
        )

    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise OfflineModeError(
            "LLM access",
            "The configured base URL must contain an http(s) hostname.",
        )
    if parsed.username or parsed.password:
        raise OfflineModeError("LLM access", "Credentials must not be embedded in the base URL.")
    if not is_offline_llm_host_allowed(parsed.hostname):
        raise OfflineModeError(
            "remote LLM access",
            f"Host '{parsed.hostname}' is not permitted by the strict offline allowlist.",
        )


def configure_offline_environment() -> None:
    """Disable LangSmith/LangChain tracing when strict offline mode is active."""

    if not is_offline_mode():
        return

    # These assignments happen only in the current process.  Do not retain an
    # API key that a third-party tracing integration could discover.
    for name in (
        "LANGCHAIN_TRACING",
        "LANGCHAIN_TRACING_V2",
        "LANGSMITH_TRACING",
        "LANGSMITH_TRACING_V2",
    ):
        os.environ[name] = "false"
    for name in (
        "LANGCHAIN_API_KEY",
        "LANGSMITH_API_KEY",
    ):
        os.environ.pop(name, None)

    # LiteLLM otherwise may refresh its model-cost map from GitHub.
    os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"
