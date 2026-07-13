from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from backend.app.database import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

TEST_ENCRYPTION_KEY = "lK5o9r4iJmP2uV1xYw8nQaBcDeFgHiJkLmNoPqRsTuU="
ROOT = Path(__file__).resolve().parents[2]


@contextmanager
def patched_env(**updates: str | None) -> Iterator[None]:
    original: dict[str, str | None] = {}
    try:
        for key, value in updates.items():
            original[key] = os.environ.get(key)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def make_test_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def make_fake_user():
    """Return a minimal fake User for auth bypass in tests.

    Uses a real object instead of MagicMock to catch attribute errors early.
    """
    import types

    user = types.SimpleNamespace()
    user.id = 1
    user.username = "testuser"
    user.email = "test@example.com"
    user.display_name = "Test User"
    user.status = "active"
    user.role = "manager"
    user.department_id = None
    user.department = None
    user.must_change_password = False
    return user
