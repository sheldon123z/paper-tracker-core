"""Comprehensive test suite for the user authentication system.

Covers: password hashing, JWT tokens, schema validation, all 6 auth API
endpoints, dependency injection guards, and edge cases.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import backend.tests  # noqa: F401
import httpx
from backend.app.auth.password import hash_password, validate_password_strength, verify_password
from backend.app.auth.schemas import ChangePasswordRequest, LoginRequest, RefreshRequest, RegisterRequest
from backend.app.auth.tokens import (
    JWT_ALGORITHM,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_refresh_token_expiry,
    hash_refresh_token,
)
from backend.app.control_plane.database import ControlBase, get_control_db
from backend.app.control_plane.models import Department, User, UserSession
from backend.app.routes.auth import _claim_refresh_session
from backend.app.routes.auth import router as auth_router
from backend.tests.support import patched_env
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# A stable secret for JWT signing in tests
TEST_JWT_SECRET = "test-jwt-secret-key-for-unit-tests-only"


def make_control_plane_session_factory():
    """Create an in-memory SQLite engine with control-plane tables."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    ControlBase.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _make_async_client(app: FastAPI) -> httpx.AsyncClient:
    """Create an httpx.AsyncClient using ASGITransport.

    Works with httpx >= 0.28 where starlette TestClient is broken.
    """
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


# ======================================================================
# 1. Password Hashing
# ======================================================================

class PasswordHashingTests(unittest.TestCase):
    def test_hash_and_verify_correct_password(self):
        hashed = hash_password("MySecretPassword123")
        self.assertTrue(verify_password("MySecretPassword123", hashed))

    def test_verify_wrong_password(self):
        hashed = hash_password("CorrectPassword")
        self.assertFalse(verify_password("WrongPassword", hashed))

    def test_hash_is_not_plaintext(self):
        hashed = hash_password("plaintext")
        self.assertNotEqual(hashed, "plaintext")
        self.assertTrue(hashed.startswith("$2"))  # bcrypt prefix

    def test_same_password_produces_different_hashes(self):
        h1 = hash_password("SamePassword")
        h2 = hash_password("SamePassword")
        self.assertNotEqual(h1, h2)  # bcrypt uses random salt

    def test_validate_password_too_short(self):
        with self.assertRaises(ValueError) as ctx:
            validate_password_strength("short")
        self.assertIn("12 bytes", str(ctx.exception))

    def test_validate_password_exactly_12_chars(self):
        validate_password_strength("Abcdefghij1!")  # 12 chars, 4 types — should not raise

    def test_validate_password_empty(self):
        with self.assertRaises(ValueError):
            validate_password_strength("")


# ======================================================================
# 2. JWT Tokens
# ======================================================================

class TokenTests(unittest.TestCase):
    def test_create_and_decode_access_token(self):
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            token, expire = create_access_token(42, "user@example.com", "user")
            payload = decode_access_token(token)
        self.assertEqual(payload["sub"], "42")
        self.assertEqual(payload["email"], "user@example.com")
        self.assertEqual(payload["role"], "user")
        self.assertEqual(payload["type"], "access")
        self.assertIsInstance(expire, datetime)

    def test_decode_invalid_token_raises(self):
        from jwt import InvalidTokenError
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET), self.assertRaises(InvalidTokenError):
            decode_access_token("not-a-real-token")

    def test_decode_token_wrong_secret_raises(self):
        from jwt import InvalidTokenError
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            token, _ = create_access_token(1, "a@b.com", "user")
        with patched_env(JWT_SECRET_KEY="different-secret"), self.assertRaises(InvalidTokenError):
            decode_access_token(token)

    def test_decode_expired_token_raises(self):
        from jwt import ExpiredSignatureError, encode
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            payload = {
                "sub": "1",
                "email": "a@b.com",
                "role": "user",
                "exp": datetime.now(UTC) - timedelta(seconds=10),
                "type": "access",
            }
            token = encode(payload, TEST_JWT_SECRET, algorithm=JWT_ALGORITHM)
            with self.assertRaises(ExpiredSignatureError):
                decode_access_token(token)

    def test_decode_non_access_type_raises(self):
        from jwt import InvalidTokenError, encode
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            payload = {
                "sub": "1",
                "email": "a@b.com",
                "role": "user",
                "exp": datetime.now(UTC) + timedelta(hours=1),
                "type": "refresh",  # wrong type
            }
            token = encode(payload, TEST_JWT_SECRET, algorithm=JWT_ALGORITHM)
            with self.assertRaises(InvalidTokenError):
                decode_access_token(token)

    def test_create_refresh_token_uniqueness(self):
        t1 = create_refresh_token()
        t2 = create_refresh_token()
        self.assertNotEqual(t1, t2)
        self.assertEqual(len(t1), 128)  # 64 bytes hex

    def test_hash_refresh_token_deterministic(self):
        token = "abc123"
        h1 = hash_refresh_token(token)
        h2 = hash_refresh_token(token)
        self.assertEqual(h1, h2)
        self.assertEqual(h1, hashlib.sha256(b"abc123").hexdigest())

    def test_refresh_token_expiry_is_future(self):
        with patched_env(JWT_REFRESH_TOKEN_EXPIRE_DAYS="30"):
            expiry = get_refresh_token_expiry()
        self.assertGreater(expiry, datetime.now(UTC))
        self.assertLess(expiry, datetime.now(UTC) + timedelta(days=31))

    def test_missing_secret_key_raises(self):
        with patched_env(JWT_SECRET_KEY=None, ENCRYPTION_KEY=None), self.assertRaises(RuntimeError):
            create_access_token(1, "a@b.com", "user")

    def test_no_fallback_to_encryption_key(self):
        """When JWT_SECRET_KEY is absent, RuntimeError is raised even if ENCRYPTION_KEY is set."""
        with patched_env(JWT_SECRET_KEY=None, ENCRYPTION_KEY="fallback-key"), self.assertRaises(RuntimeError):
            create_access_token(1, "a@b.com", "user")

    def test_custom_expire_minutes(self):
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET, JWT_ACCESS_TOKEN_EXPIRE_MINUTES="5"):
            _, expire = create_access_token(1, "a@b.com", "user")
        # Should expire roughly 5 minutes from now (allow 10s tolerance)
        delta = (expire - datetime.now(UTC)).total_seconds()
        self.assertGreater(delta, 280)
        self.assertLess(delta, 310)


# ======================================================================
# 3. Schema Validation
# ======================================================================

class SchemaValidationTests(unittest.TestCase):
    def test_register_valid(self):
        req = RegisterRequest(
            email="User@Example.COM",
            username="john_doe",
            password="secret123",
        )
        self.assertEqual(req.email, "user@example.com")  # lowercased
        self.assertEqual(req.username, "john_doe")

    def test_register_invalid_email(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            RegisterRequest(email="not-an-email", username="abc", password="12345678")

    def test_register_username_too_short(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            RegisterRequest(email="a@b.com", username="ab", password="12345678")

    def test_register_username_too_long(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            RegisterRequest(email="a@b.com", username="x" * 65, password="12345678")

    def test_register_username_special_chars_rejected(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            RegisterRequest(email="a@b.com", username="user name", password="12345678")
        with self.assertRaises(ValidationError):
            RegisterRequest(email="a@b.com", username="user@name", password="12345678")

    def test_register_username_valid_chars(self):
        req = RegisterRequest(email="a@b.com", username="user_name-123", password="12345678")
        self.assertEqual(req.username, "user_name-123")

    def test_register_display_name_optional(self):
        req = RegisterRequest(email="a@b.com", username="abc", password="12345678")
        self.assertIsNone(req.display_name)
        req2 = RegisterRequest(email="a@b.com", username="abc", password="12345678", display_name="Dr. X")
        self.assertEqual(req2.display_name, "Dr. X")

    def test_login_request(self):
        req = LoginRequest(email="a@b.com", password="pass")
        self.assertEqual(req.email, "a@b.com")

    def test_change_password_request(self):
        req = ChangePasswordRequest(current_password="old", new_password="new12345")
        self.assertEqual(req.current_password, "old")

    def test_refresh_request(self):
        req = RefreshRequest(refresh_token="some-token")
        self.assertEqual(req.refresh_token, "some-token")


# ======================================================================
# 4. API Endpoints (Integration Tests)
# ======================================================================

class AuthAPITestBase(unittest.IsolatedAsyncioTestCase):
    """Base class with a test FastAPI app, in-memory control-plane DB, and AsyncClient."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_control_plane_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    async def asyncSetUp(self):
        from backend.app.routes import limiter

        self.env_patcher = patch.dict(os.environ, {
            "JWT_SECRET_KEY": TEST_JWT_SECRET,
            "PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION": "1",
        })
        self.env_patcher.start()

        self.app = FastAPI()
        self.app.state.limiter = limiter
        # Disable rate limiting for tests
        limiter.enabled = False
        self.app.include_router(auth_router)

        sf = self.session_factory

        def override_get_control_db():
            db = sf()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[get_control_db] = override_get_control_db
        self.client = _make_async_client(self.app)

    async def asyncTearDown(self):
        await self.client.aclose()
        self.app.dependency_overrides.clear()
        self.env_patcher.stop()
        # Clean DB between tests
        with self.session_factory() as db:
            db.query(UserSession).delete()
            db.query(User).delete()
            db.query(Department).delete()
            db.commit()

    # -- Helpers --

    async def _register(self, email="test@example.com", username="testuser", password="Str0ngP@ssw0rd"):
        return await self.client.post("/api/auth/register", json={
            "email": email,
            "username": username,
            "password": password,
        })

    async def _login(self, email="test@example.com", password="Str0ngP@ssw0rd"):
        return await self.client.post("/api/auth/login", json={
            "email": email,
            "password": password,
        })

    async def _register_and_login(self, email="test@example.com", username="testuser", password="Str0ngP@ssw0rd"):
        await self._register(email=email, username=username, password=password)
        res = await self._login(email=email, password=password)
        return self._extract_tokens(res)

    @staticmethod
    def _extract_tokens(response):
        """Extract access and refresh tokens from httpOnly cookies."""
        tokens = {}
        for cookie_name in ("access_token", "refresh_token"):
            for cookie in response.cookies.jar:
                if cookie.name == cookie_name:
                    tokens[cookie_name] = cookie.value
                    break
        tokens.setdefault("access_token", None)
        tokens.setdefault("refresh_token", None)
        return tokens

    def _auth_header(self, access_token):
        return {"Authorization": f"Bearer {access_token}"}


class RegisterTests(AuthAPITestBase):
    async def test_capabilities_reflect_runtime_registration_setting(self):
        enabled = await self.client.get("/api/auth/capabilities")
        self.assertEqual(enabled.status_code, 200)
        self.assertEqual(enabled.json(), {"public_registration_enabled": True})
        self.assertEqual(enabled.headers["cache-control"], "no-store")

        with patch.dict(
            os.environ,
            {"PAPER_TRACKER_ALLOW_PUBLIC_REGISTRATION": "0"},
        ):
            disabled = await self.client.get("/api/auth/capabilities")

        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(disabled.json(), {"public_registration_enabled": False})

    async def test_register_success(self):
        res = await self._register()
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["email"], "test@example.com")
        self.assertEqual(data["username"], "testuser")
        self.assertEqual(data["status"], "active")
        self.assertEqual(data["role"], "user")
        self.assertIn("id", data)
        self.assertIn("created_at", data)

    async def test_register_with_display_name(self):
        res = await self.client.post("/api/auth/register", json={
            "email": "dr@uni.edu",
            "username": "drsmith",
            "password": "Str0ngP@ssw0rd",
            "display_name": "Dr. Smith",
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["display_name"], "Dr. Smith")

    async def test_register_duplicate_email(self):
        await self._register(email="dup@example.com", username="user1")
        res = await self._register(email="dup@example.com", username="user2")
        self.assertEqual(res.status_code, 409)
        self.assertIn("Email already registered", res.json()["detail"])

    async def test_register_duplicate_username(self):
        await self._register(email="a@example.com", username="dupuser")
        res = await self._register(email="b@example.com", username="dupuser")
        self.assertEqual(res.status_code, 409)
        self.assertIn("Username already taken", res.json()["detail"])

    async def test_register_weak_password(self):
        res = await self._register(password="short")
        self.assertEqual(res.status_code, 400)
        self.assertIn("12 bytes", res.json()["detail"])

    async def test_register_invalid_email(self):
        res = await self._register(email="not-an-email")
        self.assertEqual(res.status_code, 422)  # Pydantic validation

    async def test_register_short_username(self):
        res = await self._register(username="ab")
        self.assertEqual(res.status_code, 422)

    async def test_register_email_case_insensitive(self):
        await self._register(email="User@Example.COM", username="user1")
        res = await self._register(email="user@example.com", username="user2")
        self.assertEqual(res.status_code, 409)  # same email, lowercase


class LoginTests(AuthAPITestBase):
    async def test_login_success(self):
        await self._register()
        res = await self._login()
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # Tokens are now in httpOnly cookies, not JSON body
        self.assertIn("message", data)
        self.assertIn("user", data)
        self.assertIn("department_name", data["user"])
        self.assertIsNone(data["user"]["department_name"])
        self.assertIsInstance(data["expires_in"], int)
        self.assertGreater(data["expires_in"], 0)
        # Verify cookies are set
        tokens = self._extract_tokens(res)
        self.assertIsNotNone(tokens["access_token"])
        self.assertIsNotNone(tokens["refresh_token"])

    async def test_login_user_includes_department_name(self):
        await self._register()
        with self.session_factory() as db:
            department = Department(code="computer-science", name="Computer Science")
            db.add(department)
            db.flush()
            user = db.query(User).filter(User.email == "test@example.com").one()
            user.department_id = department.id
            db.commit()
            department_id = department.id

        res = await self._login()

        self.assertEqual(res.status_code, 200)
        user_data = res.json()["user"]
        self.assertEqual(user_data["department_id"], department_id)
        self.assertEqual(user_data["department_name"], "Computer Science")

    async def test_login_wrong_password(self):
        await self._register()
        res = await self._login(password="WrongPassword")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Invalid email or password", res.json()["detail"])

    async def test_login_nonexistent_user(self):
        res = await self._login(email="noone@example.com")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Invalid email or password", res.json()["detail"])

    async def test_login_disabled_user(self):
        await self._register()
        with self.session_factory() as db:
            user = db.query(User).filter(User.email == "test@example.com").first()
            user.status = "disabled"
            db.commit()

        res = await self._login()
        self.assertEqual(res.status_code, 403)
        self.assertIn("disabled", res.json()["detail"])

    async def test_login_updates_last_login(self):
        await self._register()
        await self._login()
        with self.session_factory() as db:
            user = db.query(User).filter(User.email == "test@example.com").first()
            self.assertIsNotNone(user.last_login_at)

    async def test_login_creates_session(self):
        await self._register()
        await self._login()
        with self.session_factory() as db:
            sessions = db.query(UserSession).all()
            self.assertEqual(len(sessions), 1)
            self.assertIsNone(sessions[0].revoked_at)

    async def test_login_access_token_is_decodable(self):
        tokens = await self._register_and_login()
        self.assertIsNotNone(tokens["access_token"])
        payload = decode_access_token(tokens["access_token"])
        self.assertEqual(payload["email"], "test@example.com")
        self.assertEqual(payload["role"], "user")


class MeEndpointTests(AuthAPITestBase):
    async def test_me_returns_profile(self):
        tokens = await self._register_and_login()
        res = await self.client.get("/api/auth/me", headers=self._auth_header(tokens["access_token"]))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["email"], "test@example.com")
        self.assertEqual(data["username"], "testuser")
        self.assertEqual(data["role"], "user")
        self.assertIn("department_name", data)
        self.assertIsNone(data["department_name"])
        self.assertNotIn("password_hash", data)

    async def test_me_returns_department_name(self):
        await self._register()
        with self.session_factory() as db:
            department = Department(code="physics", name="Physics")
            db.add(department)
            db.flush()
            user = db.query(User).filter(User.email == "test@example.com").one()
            user.department_id = department.id
            db.commit()
            department_id = department.id

        login_res = await self._login()
        tokens = self._extract_tokens(login_res)
        res = await self.client.get(
            "/api/auth/me",
            headers=self._auth_header(tokens["access_token"]),
        )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["department_id"], department_id)
        self.assertEqual(data["department_name"], "Physics")

    async def test_me_manager_department_name_is_null(self):
        await self._register()
        with self.session_factory() as db:
            department = Department(code="management", name="Management")
            db.add(department)
            db.flush()
            user = db.query(User).filter(User.email == "test@example.com").one()
            user.role = "manager"
            user.department_id = department.id
            db.commit()

        login_res = await self._login()
        tokens = self._extract_tokens(login_res)
        res = await self.client.get(
            "/api/auth/me",
            headers=self._auth_header(tokens["access_token"]),
        )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["role"], "manager")
        self.assertIsNone(data["department_name"])

    async def test_me_no_token_returns_401(self):
        res = await self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, 401)

    async def test_me_invalid_token_returns_401(self):
        res = await self.client.get("/api/auth/me", headers=self._auth_header("garbage-token"))
        self.assertEqual(res.status_code, 401)

    async def test_me_disabled_user_returns_403(self):
        tokens = await self._register_and_login()
        with self.session_factory() as db:
            user = db.query(User).filter(User.email == "test@example.com").first()
            user.status = "disabled"
            db.commit()
        res = await self.client.get("/api/auth/me", headers=self._auth_header(tokens["access_token"]))
        self.assertEqual(res.status_code, 403)


class RefreshTests(AuthAPITestBase):
    async def test_refresh_success(self):
        tokens = await self._register_and_login()
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(res.status_code, 200)
        new_tokens = self._extract_tokens(res)
        self.assertIsNotNone(new_tokens["access_token"])
        self.assertIsNotNone(new_tokens["refresh_token"])
        self.assertNotEqual(new_tokens["access_token"], tokens["access_token"])
        self.assertNotEqual(new_tokens["refresh_token"], tokens["refresh_token"])

    async def test_refresh_revokes_old_token(self):
        tokens = await self._register_and_login()
        # Clear cookies so refresh uses body token, not cookie
        self.client.cookies.clear()
        await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        # Clear cookies again so the OLD token from body is used (not new cookie)
        self.client.cookies.clear()
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("revoked", res.json()["detail"])

    async def test_refresh_invalid_token(self):
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": "nonexistent-token",
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("Invalid refresh token", res.json()["detail"])

    async def test_refresh_expired_token(self):
        tokens = await self._register_and_login()
        token_hash = hash_refresh_token(tokens["refresh_token"])
        with self.session_factory() as db:
            session = db.query(UserSession).filter(
                UserSession.refresh_token_hash == token_hash,
            ).first()
            session.expires_at = datetime.now(UTC) - timedelta(days=1)
            db.commit()

        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("expired", res.json()["detail"])

    async def test_refresh_disabled_user(self):
        tokens = await self._register_and_login()
        with self.session_factory() as db:
            user = db.query(User).filter(User.email == "test@example.com").first()
            user.status = "disabled"
            db.commit()

        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("not active", res.json()["detail"])

    async def test_refresh_new_token_is_usable(self):
        tokens = await self._register_and_login()
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        new_tokens = self._extract_tokens(res)
        me_res = await self.client.get("/api/auth/me", headers=self._auth_header(new_tokens["access_token"]))
        self.assertEqual(me_res.status_code, 200)
        res2 = await self.client.post("/api/auth/refresh", json={
            "refresh_token": new_tokens["refresh_token"],
        })
        self.assertEqual(res2.status_code, 200)

    async def test_refresh_race_loser_does_not_mint_replacement(self):
        tokens = await self._register_and_login()
        self.client.cookies.clear()

        with (
            patch("backend.app.routes.auth._claim_refresh_session", return_value=False),
            patch("backend.app.routes.auth.create_refresh_token") as create_token,
        ):
            res = await self.client.post("/api/auth/refresh", json={
                "refresh_token": tokens["refresh_token"],
            })

        self.assertEqual(res.status_code, 401)
        self.assertIn("revoked", res.json()["detail"])
        create_token.assert_not_called()
        with self.session_factory() as db:
            sessions = db.query(UserSession).all()
            self.assertEqual(len(sessions), 1)
            self.assertIsNone(sessions[0].revoked_at)


class RefreshRotationAtomicityTests(unittest.TestCase):
    def test_two_stale_database_sessions_create_only_one_descendant(self):
        with tempfile.TemporaryDirectory(prefix="paper-tracker-auth-") as temp_dir:
            engine = create_engine(
                f"sqlite:///{Path(temp_dir) / 'control-plane.db'}",
                connect_args={"check_same_thread": False},
            )
            ControlBase.metadata.create_all(bind=engine)
            session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

            with session_factory() as seed_db:
                user = User(
                    email="race@example.com",
                    username="race-user",
                    password_hash="unused-in-this-test",
                )
                seed_db.add(user)
                seed_db.flush()
                original = UserSession(
                    user_id=user.id,
                    session_key="original-session",
                    refresh_token_hash="original-refresh-hash",
                    expires_at=datetime.now(UTC) + timedelta(days=1),
                )
                seed_db.add(original)
                seed_db.commit()
                original_id = original.id
                user_id = user.id

            first_db = session_factory()
            second_db = session_factory()
            try:
                # Both transactions observe the same stale, unrevoked row.
                first_stale = first_db.query(UserSession).filter(UserSession.id == original_id).one()
                second_stale = second_db.query(UserSession).filter(UserSession.id == original_id).one()
                self.assertIsNone(first_stale.revoked_at)
                self.assertIsNone(second_stale.revoked_at)

                first_won = _claim_refresh_session(
                    first_db,
                    session_id=original_id,
                    refresh_token_hash="original-refresh-hash",
                    revoked_at=datetime.now(UTC),
                )
                if first_won:
                    first_db.add(UserSession(
                        user_id=user_id,
                        session_key="first-descendant",
                        refresh_token_hash="first-descendant-hash",
                        expires_at=datetime.now(UTC) + timedelta(days=1),
                    ))
                    first_db.commit()

                second_won = _claim_refresh_session(
                    second_db,
                    session_id=original_id,
                    refresh_token_hash="original-refresh-hash",
                    revoked_at=datetime.now(UTC),
                )
                if second_won:
                    second_db.add(UserSession(
                        user_id=user_id,
                        session_key="second-descendant",
                        refresh_token_hash="second-descendant-hash",
                        expires_at=datetime.now(UTC) + timedelta(days=1),
                    ))
                    second_db.commit()
                else:
                    second_db.rollback()

                self.assertTrue(first_won)
                self.assertFalse(second_won)
            finally:
                first_db.close()
                second_db.close()

            with session_factory() as verify_db:
                sessions = verify_db.query(UserSession).order_by(UserSession.id).all()
                self.assertEqual(len(sessions), 2)
                self.assertIsNotNone(sessions[0].revoked_at)
                active_hashes = {item.refresh_token_hash for item in sessions if item.revoked_at is None}
                self.assertEqual(active_hashes, {"first-descendant-hash"})

            engine.dispose()


class LogoutTests(AuthAPITestBase):
    async def test_logout_revokes_refresh_token(self):
        tokens = await self._register_and_login()
        res = await self.client.post(
            "/api/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
            headers=self._auth_header(tokens["access_token"]),
        )
        self.assertEqual(res.status_code, 200)

        res2 = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(res2.status_code, 401)

    async def test_logout_no_auth_returns_401(self):
        res = await self.client.post("/api/auth/logout", json={"refresh_token": "x"})
        self.assertEqual(res.status_code, 401)

    async def test_logout_unknown_refresh_token_still_200(self):
        tokens = await self._register_and_login()
        res = await self.client.post(
            "/api/auth/logout",
            json={"refresh_token": "nonexistent-token"},
            headers=self._auth_header(tokens["access_token"]),
        )
        self.assertEqual(res.status_code, 200)

    async def test_logout_other_users_token_not_revoked(self):
        await self._register(email="a@test.com", username="usera")
        tokens_a = self._extract_tokens(await self._login(email="a@test.com"))
        await self._register(email="b@test.com", username="userb")
        tokens_b = self._extract_tokens(await self._login(email="b@test.com"))

        # Clear cookies so logout uses header auth (user A) + body token (user B's)
        self.client.cookies.clear()
        await self.client.post(
            "/api/auth/logout",
            json={"refresh_token": tokens_b["refresh_token"]},
            headers=self._auth_header(tokens_a["access_token"]),
        )

        # Clear cookies so refresh uses body token
        self.client.cookies.clear()
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens_b["refresh_token"],
        })
        self.assertEqual(res.status_code, 200)


class ChangePasswordTests(AuthAPITestBase):
    async def test_change_password_success(self):
        tokens = await self._register_and_login()
        res = await self.client.post(
            "/api/auth/change-password",
            json={"current_password": "Str0ngP@ssw0rd", "new_password": "NewStr0ngP@ssw0rd"},
            headers=self._auth_header(tokens["access_token"]),
        )
        self.assertEqual(res.status_code, 200)

        res2 = await self._login(password="Str0ngP@ssw0rd")
        self.assertEqual(res2.status_code, 401)

        res3 = await self._login(password="NewStr0ngP@ssw0rd")
        self.assertEqual(res3.status_code, 200)

    async def test_change_password_wrong_current(self):
        tokens = await self._register_and_login()
        res = await self.client.post(
            "/api/auth/change-password",
            json={"current_password": "WrongCurrent", "new_password": "NewStr0ngP@ssw0rd"},
            headers=self._auth_header(tokens["access_token"]),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("incorrect", res.json()["detail"])

    async def test_change_password_weak_new(self):
        tokens = await self._register_and_login()
        res = await self.client.post(
            "/api/auth/change-password",
            json={"current_password": "Str0ngP@ssw0rd", "new_password": "short"},
            headers=self._auth_header(tokens["access_token"]),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("12 bytes", res.json()["detail"])

    async def test_change_password_no_auth(self):
        res = await self.client.post(
            "/api/auth/change-password",
            json={"current_password": "x", "new_password": "y" * 8},
        )
        self.assertEqual(res.status_code, 401)


# ======================================================================
# 5. Auth Dependencies (Unit Tests)
# ======================================================================

class DependencyTests(unittest.TestCase):
    """Test get_current_user and get_optional_user as standalone functions."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_control_plane_session_factory()
        # Seed a test user
        with cls.session_factory() as db:
            user = User(
                email="dep@test.com",
                username="depuser",
                password_hash=hash_password("Str0ngP@ssw0rd"),
                status="active",
                role="user",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            cls.test_user_id = user.id
            cls.session_key = "dependency-test-session"
            db.add(UserSession(
                user_id=user.id,
                session_key=cls.session_key,
                refresh_token_hash="dependency-test-refresh",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            ))
            db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def _get_db(self):
        return self.session_factory()

    @staticmethod
    def _mock_request(cookies=None):
        """Create a mock request with cookies support for dependency functions."""
        import types
        req = types.SimpleNamespace(cookies=cookies or {})
        return req

    def test_get_current_user_valid_token(self):
        from backend.app.auth.dependencies import get_current_user
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            token, _ = create_access_token(
                self.test_user_id, "dep@test.com", "user", self.session_key,
            )
            db = self._get_db()
            try:
                user = get_current_user(request=self._mock_request(), token=token, db=db)
                self.assertEqual(user.email, "dep@test.com")
            finally:
                db.close()

    def test_get_current_user_invalid_token_raises(self):
        from backend.app.auth.dependencies import get_current_user
        from fastapi import HTTPException
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            db = self._get_db()
            try:
                with self.assertRaises(HTTPException) as ctx:
                    get_current_user(request=self._mock_request(), token="invalid", db=db)
                self.assertEqual(ctx.exception.status_code, 401)
            finally:
                db.close()

    def test_get_current_user_deleted_user_raises(self):
        from backend.app.auth.dependencies import get_current_user
        from fastapi import HTTPException
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            # Token for a non-existent user ID
            token, _ = create_access_token(99999, "ghost@test.com", "user")
            db = self._get_db()
            try:
                with self.assertRaises(HTTPException) as ctx:
                    get_current_user(request=self._mock_request(), token=token, db=db)
                self.assertEqual(ctx.exception.status_code, 401)
            finally:
                db.close()

    def test_get_current_user_disabled_raises_403(self):
        from backend.app.auth.dependencies import get_current_user
        from fastapi import HTTPException
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            # Create and disable user
            with self.session_factory() as db:
                user = User(
                    email="disabled@test.com",
                    username="disableduser",
                    password_hash=hash_password("pass12345"),
                    status="disabled",
                    role="user",
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                disabled_id = user.id

            token, _ = create_access_token(disabled_id, "disabled@test.com", "user")
            db = self._get_db()
            try:
                with self.assertRaises(HTTPException) as ctx:
                    get_current_user(request=self._mock_request(), token=token, db=db)
                self.assertEqual(ctx.exception.status_code, 403)
            finally:
                db.close()

    def test_get_optional_user_with_valid_token(self):
        from backend.app.auth.dependencies import get_optional_user
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            token, _ = create_access_token(
                self.test_user_id, "dep@test.com", "user", self.session_key,
            )
            db = self._get_db()
            try:
                user = get_optional_user(request=self._mock_request(), token=token, db=db)
                self.assertIsNotNone(user)
                self.assertEqual(user.email, "dep@test.com")
            finally:
                db.close()

    def test_get_optional_user_no_token_returns_none(self):
        from backend.app.auth.dependencies import get_optional_user
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            db = self._get_db()
            try:
                user = get_optional_user(request=self._mock_request(), token=None, db=db)
                self.assertIsNone(user)
            finally:
                db.close()

    def test_get_optional_user_invalid_token_returns_none(self):
        from backend.app.auth.dependencies import get_optional_user
        with patched_env(JWT_SECRET_KEY=TEST_JWT_SECRET):
            db = self._get_db()
            try:
                user = get_optional_user(request=self._mock_request(), token="bad-token", db=db)
                self.assertIsNone(user)
            finally:
                db.close()

    def test_ingestion_service_requires_the_explicit_service_token(self):
        import types

        from backend.app.auth.dependencies import get_current_user_or_ingestion_service
        from fastapi import HTTPException

        request = types.SimpleNamespace(
            cookies={},
            state=types.SimpleNamespace(),
            client=types.SimpleNamespace(host="127.0.0.1"),
        )
        db = self._get_db()
        try:
            with patched_env(PAPER_TRACKER_SERVICE_TOKEN="scheduler-secret"):
                principal = get_current_user_or_ingestion_service(
                    request=request,
                    token=None,
                    x_service_token="scheduler-secret",
                    db=db,
                )
                self.assertIsNone(principal)
                with self.assertRaises(HTTPException) as raised:
                    get_current_user_or_ingestion_service(
                        request=request,
                        token=None,
                        x_service_token=None,
                        db=db,
                    )
                self.assertEqual(raised.exception.status_code, 401)
        finally:
            db.close()


# ======================================================================
# 6. Control Plane Models
# ======================================================================

class ControlPlaneModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_control_plane_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def tearDown(self):
        with self.session_factory() as db:
            db.query(UserSession).delete()
            db.query(User).delete()
            db.commit()

    def test_user_defaults(self):
        with self.session_factory() as db:
            user = User(
                email="m@t.com",
                username="modeltest",
                password_hash="fake-hash",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            self.assertEqual(user.status, "active")
            self.assertEqual(user.role, "user")
            self.assertIsNotNone(user.created_at)
            self.assertIsNotNone(user.updated_at)
            self.assertIsNone(user.last_login_at)
            self.assertIsNone(user.display_name)

    def test_user_email_unique(self):
        from sqlalchemy.exc import IntegrityError
        with self.session_factory() as db:
            db.add(User(email="dup@t.com", username="u1", password_hash="h"))
            db.commit()
            db.add(User(email="dup@t.com", username="u2", password_hash="h"))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()

    def test_user_username_unique(self):
        from sqlalchemy.exc import IntegrityError
        with self.session_factory() as db:
            db.add(User(email="a@t.com", username="same", password_hash="h"))
            db.commit()
            db.add(User(email="b@t.com", username="same", password_hash="h"))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()

    def test_session_cascade_delete(self):
        with self.session_factory() as db:
            user = User(email="c@t.com", username="cascade", password_hash="h")
            db.add(user)
            db.commit()
            db.refresh(user)
            session = UserSession(
                user_id=user.id,
                refresh_token_hash="hash123",
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
            db.add(session)
            db.commit()
            self.assertEqual(db.query(UserSession).count(), 1)

            db.delete(user)
            db.commit()
            # Session should be cascade-deleted
            self.assertEqual(db.query(UserSession).count(), 0)


# ======================================================================
# 7. Full Auth Flow (End-to-End)
# ======================================================================

class FullAuthFlowTests(AuthAPITestBase):
    async def test_register_login_use_refresh_logout(self):
        """Complete lifecycle: register -> login -> access /me -> refresh -> access /me -> logout."""
        # 1. Register
        reg_res = await self._register()
        self.assertEqual(reg_res.status_code, 201)

        # 2. Login
        login_res = await self._login()
        self.assertEqual(login_res.status_code, 200)
        tokens = self._extract_tokens(login_res)

        # 3. Access /me
        me_res = await self.client.get("/api/auth/me", headers=self._auth_header(tokens["access_token"]))
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["email"], "test@example.com")

        # 4. Refresh
        refresh_res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        self.assertEqual(refresh_res.status_code, 200)
        new_tokens = self._extract_tokens(refresh_res)

        # 5. Access /me with new token
        me_res2 = await self.client.get("/api/auth/me", headers=self._auth_header(new_tokens["access_token"]))
        self.assertEqual(me_res2.status_code, 200)

        # 6. Logout
        logout_res = await self.client.post(
            "/api/auth/logout",
            json={"refresh_token": new_tokens["refresh_token"]},
            headers=self._auth_header(new_tokens["access_token"]),
        )
        self.assertEqual(logout_res.status_code, 200)

        # 7. Refresh should fail after logout
        refresh_res2 = await self.client.post("/api/auth/refresh", json={
            "refresh_token": new_tokens["refresh_token"],
        })
        self.assertEqual(refresh_res2.status_code, 401)

    async def test_multiple_sessions_independent(self):
        """Multiple logins create independent sessions; revoking one doesn't affect others."""
        await self._register()
        tokens1 = self._extract_tokens(await self._login())
        tokens2 = self._extract_tokens(await self._login())

        # Both should work
        self.client.cookies.clear()
        r1 = await self.client.get("/api/auth/me", headers=self._auth_header(tokens1["access_token"]))
        self.assertEqual(r1.status_code, 200)
        r2 = await self.client.get("/api/auth/me", headers=self._auth_header(tokens2["access_token"]))
        self.assertEqual(r2.status_code, 200)

        # Logout session 1 — clear cookies so header auth + body token are used
        self.client.cookies.clear()
        await self.client.post(
            "/api/auth/logout",
            json={"refresh_token": tokens1["refresh_token"]},
            headers=self._auth_header(tokens1["access_token"]),
        )

        # Session 2 refresh should still work — clear cookies to use body token
        self.client.cookies.clear()
        res = await self.client.post("/api/auth/refresh", json={
            "refresh_token": tokens2["refresh_token"],
        })
        self.assertEqual(res.status_code, 200)

    async def test_change_password_then_login(self):
        """After password change, only new password works."""
        tokens = await self._register_and_login()

        await self.client.post(
            "/api/auth/change-password",
            json={"current_password": "Str0ngP@ssw0rd", "new_password": "BrandNewP@ssw0rd"},
            headers=self._auth_header(tokens["access_token"]),
        )

        # Old password fails
        self.assertEqual((await self._login(password="Str0ngP@ssw0rd")).status_code, 401)
        # New password works
        self.assertEqual((await self._login(password="BrandNewP@ssw0rd")).status_code, 200)


if __name__ == "__main__":
    unittest.main()
