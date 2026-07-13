import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.control_plane.database import ControlBase
from backend.app.control_plane.models import AuditEvent, User, UserSession
from backend.app.routes.admin import list_sessions, revoke_user_sessions


class AdminAccessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        ControlBase.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.manager = User(
            email="manager@example.com",
            username="manager",
            password_hash="hash",
            role="manager",
        )
        self.user = User(
            email="user@example.com",
            username="user",
            password_hash="hash",
            role="user",
        )
        self.db.add_all([self.manager, self.user])
        self.db.commit()
        for number in range(2):
            self.db.add(UserSession(
                user_id=self.user.id,
                session_key=f"session-{number}",
                refresh_token_hash=f"refresh-{number}",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def request():
        return SimpleNamespace(
            method="POST",
            url=SimpleNamespace(path="/api/admin/users/2/revoke-sessions"),
            client=SimpleNamespace(host="127.0.0.1"),
            headers={"user-agent": "test"},
            state=SimpleNamespace(session_key="manager-session"),
        )

    def test_manager_can_revoke_all_sessions_without_exposing_session_keys(self):
        result = revoke_user_sessions(
            self.user.id, self.request(), self.manager, self.db,
        )
        self.assertEqual(result["revoked"], 2)
        sessions = list_sessions(user_id=self.user.id, db=self.db)
        self.assertTrue(all(not session["active"] for session in sessions))
        self.assertTrue(all("session_key" not in session for session in sessions))
        event = self.db.query(AuditEvent).filter(
            AuditEvent.event_type == "admin.user.sessions_revoked",
        ).one()
        self.assertEqual(event.subject_user_id, self.user.id)


if __name__ == "__main__":
    unittest.main()
