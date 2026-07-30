import os

from cryptography.fernet import Fernet, MultiFernet

from ..settings import get_secret_value


def _get_fernets() -> list[Fernet]:
    key = get_secret_value("ENCRYPTION_KEY", "") or ""
    if not key:
        raise ValueError("ENCRYPTION_KEY or ENCRYPTION_KEY_FILE is not set")
    keys = [key]
    fallback_keys = (get_secret_value("ENCRYPTION_KEY_FALLBACKS", "") or "").strip()
    if fallback_keys:
        keys.extend(part.strip() for part in fallback_keys.split(",") if part.strip())
    return [Fernet(item.encode() if isinstance(item, str) else item) for item in keys]


def _get_primary_fernet() -> Fernet:
    return _get_fernets()[0]


def _get_multi_fernet() -> MultiFernet:
    return MultiFernet(_get_fernets())


def encrypt_value(plaintext: str) -> str:
    return _get_primary_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    return _get_multi_fernet().decrypt(ciphertext.encode()).decode()


def rotate_value(ciphertext: str) -> str:
    return encrypt_value(decrypt_value(ciphertext))


def current_key_version() -> int:
    try:
        return max(1, int(os.getenv("ENCRYPTION_KEY_VERSION", "1")))
    except ValueError:
        return 1


def generate_key() -> str:
    return Fernet.generate_key().decode()
