import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from backend.app.control_plane.database import ControlBase
from backend.app.control_plane.models import AuditEvent, Department, User, UserSession
from backend.app.routes.admin import UserCreate, create_user, delete_user
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


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
        self.department = Department(code="research", name="研究部")
        self.db.add_all([self.manager, self.user, self.department])
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
            method="DELETE",
            url=SimpleNamespace(path="/api/admin/users/2"),
            client=SimpleNamespace(host="127.0.0.1"),
            headers={"user-agent": "test"},
            state=SimpleNamespace(session_key="manager-session"),
        )

    def test_manager_can_delete_account_and_all_sessions(self):
        deleted_user_id = self.user.id
        self.db.add(AuditEvent(
            actor_user_id=deleted_user_id,
            event_type="api.request",
            outcome="success",
        ))
        self.db.commit()

        result = delete_user(deleted_user_id, self.request(), self.manager, self.db)

        self.assertEqual(result["user_id"], deleted_user_id)
        self.assertIsNone(self.db.query(User).filter(User.id == deleted_user_id).first())
        self.assertEqual(
            self.db.query(UserSession).filter(UserSession.user_id == deleted_user_id).count(), 0,
        )
        historical_event = self.db.query(AuditEvent).filter(
            AuditEvent.event_type == "api.request",
        ).one()
        self.assertIsNone(historical_event.actor_user_id)
        deletion_event = self.db.query(AuditEvent).filter(
            AuditEvent.event_type == "admin.user.deleted",
        ).one()
        self.assertEqual(deletion_event.actor_user_id, self.manager.id)
        self.assertEqual(deletion_event.subject_user_id, deleted_user_id)

    def test_manager_cannot_delete_own_account(self):
        with self.assertRaises(HTTPException) as raised:
            delete_user(self.manager.id, self.request(), self.manager, self.db)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "不能注销当前登录的管理员账号")
        self.assertIsNotNone(self.db.query(User).filter(User.id == self.manager.id).first())

    def test_department_account_creation_requires_one_specific_department(self):
        body = UserCreate(
            email="new-user@example.com",
            username="new_user",
            temporary_password="StrongPassword1!",
            role="user",
            department_id=None,
        )

        with self.assertRaises(HTTPException) as raised:
            create_user(body, self.request(), self.manager, self.db)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail, "创建部门账号时必须选择一个具体部门")

    def test_department_account_creation_binds_exactly_selected_department(self):
        body = UserCreate(
            email="new-user@example.com",
            username="new_user",
            temporary_password="StrongPassword1!",
            role="user",
            department_id=self.department.id,
        )

        result = create_user(body, self.request(), self.manager, self.db)

        self.assertEqual(result["department_id"], self.department.id)
        created = self.db.query(User).filter(User.email == body.email).one()
        self.assertEqual(created.department_id, self.department.id)

    def test_user_create_uses_chinese_minimum_length_errors(self):
        for field, value in (("username", "ab"), ("display_name", "名")):
            payload = {
                "email": "new-user@example.com",
                "username": "valid_user",
                "display_name": "有效名称",
                "temporary_password": "StrongPassword1!",
                "role": "user",
                "department_id": self.department.id,
                field: value,
            }
            with self.subTest(field=field), self.assertRaises(ValidationError) as raised:
                UserCreate(**payload)
            self.assertIn("至少包含三个字符", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
