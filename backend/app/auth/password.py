import bcrypt as _bcrypt_mod

# Patch passlib compatibility with bcrypt >= 4.0
# passlib expects bcrypt.__about__.__version__ which was removed in bcrypt 4.x
if not hasattr(_bcrypt_mod, "__about__"):
    _bcrypt_mod.__about__ = type("about", (), {"__version__": _bcrypt_mod.__version__})()

# Patch bcrypt wrap bug detection to use shorter password (count bytes not characters)
original_hashpw = _bcrypt_mod.hashpw

def patched_hashpw(secret, salt):
    if isinstance(secret, str):
        secret_bytes = secret.encode("utf-8")
        if len(secret_bytes) > 72:
            # Truncate at byte level, then decode back to string safely
            truncated_bytes = secret_bytes[:72]
            # Find the last complete character boundary
            while truncated_bytes and (truncated_bytes[-1] & 0xC0) == 0x80:
                truncated_bytes = truncated_bytes[:-1]
            secret = truncated_bytes.decode("utf-8", errors="ignore")
    elif len(secret) > 72:
        secret = secret[:72]
    return original_hashpw(secret, salt)

_bcrypt_mod.hashpw = patched_hashpw

from passlib.context import CryptContext  # noqa: E402

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _safe_truncate_72_bytes(password: str) -> str:
    """Safely truncate password to 72 bytes (bcrypt limit), preserving UTF-8 character boundaries.

    bcrypt only uses the first 72 bytes. Truncating in the middle of a multi-byte
    UTF-8 character can produce invalid Unicode; this function ensures we truncate
    at a valid character boundary.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) <= 72:
        return password
    # Truncate to 72 bytes first
    truncated = password_bytes[:72]
    # Back up until we find a valid leading byte (not 10xxxxxx)
    while truncated and (truncated[-1] & 0xC0) == 0x80:
        truncated = truncated[:-1]
    # Decode back to string, ignoring any remaining partial characters
    return truncated.decode("utf-8", errors="ignore")


def hash_password(password: str) -> str:
    # bcrypt silently truncates at 72 bytes; make it explicit to avoid surprises
    return pwd_context.hash(_safe_truncate_72_bytes(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(_safe_truncate_72_bytes(plain_password), hashed_password)


def validate_password_strength(password: str) -> None:
    pwd_bytes = password.encode("utf-8")
    if len(pwd_bytes) < 12:
        raise ValueError("Password must be at least 12 bytes long (UTF-8 encoded)")
    if len(pwd_bytes) > 72:
        raise ValueError("Password must not exceed 72 bytes (UTF-8 encoded); bcrypt truncates beyond this limit")
    char_types = 0
    if any(c.isupper() for c in password):
        char_types += 1
    if any(c.islower() for c in password):
        char_types += 1
    if any(c.isdigit() for c in password):
        char_types += 1
    if any(not c.isalnum() for c in password):
        char_types += 1
    if char_types < 3:
        raise ValueError(
            "Password must contain at least 3 of: uppercase, lowercase, digits, special characters"
        )
