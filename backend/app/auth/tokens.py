import hashlib
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta

from jwt import ExpiredSignatureError, InvalidTokenError, decode, encode

logger = logging.getLogger(__name__)


def _get_secret_key() -> str:
    key = os.getenv("JWT_SECRET_KEY")
    if key:
        return key

    raise RuntimeError(
        "JWT_SECRET_KEY must be set. Generate one with: "
        "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )


JWT_ALGORITHM = "HS256"


def _get_access_expire_minutes() -> int:
    return int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))


def _get_refresh_expire_days() -> int:
    return int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "30"))


def create_access_token(user_id: int, email: str, role: str) -> tuple[str, datetime]:
    expire = datetime.now(UTC) + timedelta(minutes=_get_access_expire_minutes())
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
        "type": "access",
        "jti": secrets.token_hex(16),
    }
    token = encode(payload, _get_secret_key(), algorithm=JWT_ALGORITHM)
    return token, expire


def create_refresh_token() -> str:
    return secrets.token_hex(64)


def decode_access_token(token: str) -> dict:
    try:
        payload = decode(token, _get_secret_key(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise InvalidTokenError("Invalid token type")
        return payload
    except (ExpiredSignatureError, InvalidTokenError):
        raise


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_refresh_token_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=_get_refresh_expire_days())
