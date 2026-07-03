"""Comprehensive tests for feedback API."""

from __future__ import annotations

import unittest

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import MessageFeedback
from backend.app.routes import feedback as feedback_module
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient


class FeedbackRouteTests(unittest.TestCase):
    """Tests for /api/feedback endpoints."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(feedback_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[feedback_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(MessageFeedback.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    # -------------------------------------------------------------------------
    # POST /api/feedback - Create feedback
    # -------------------------------------------------------------------------

    def test_create_feedback_positive(self):
        """Test creating positive feedback."""
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-001",
                "session_id": "session-abc",
                "session_type": "paper",
                "feedback_type": "thumbsUp",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["ok"], True)

        # Verify in DB
        with self.session_factory() as db:
            feedback = db.query(MessageFeedback).filter_by(
                message_id="msg-001",
            ).first()
            self.assertIsNotNone(feedback)
            self.assertEqual(feedback.message_id, "msg-001")
            self.assertEqual(feedback.session_id, "session-abc")
            self.assertEqual(feedback.feedback_type, "thumbsUp")

    def test_create_feedback_negative(self):
        """Test creating negative feedback."""
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-002",
                "session_id": "session-abc",
                "session_type": "global",
                "feedback_type": "thumbsDown",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["ok"], True)

        # Verify in DB
        with self.session_factory() as db:
            feedback = db.query(MessageFeedback).filter_by(
                message_id="msg-002",
            ).first()
            self.assertIsNotNone(feedback)
            self.assertEqual(feedback.message_id, "msg-002")
            self.assertEqual(feedback.session_id, "session-abc")
            self.assertEqual(feedback.feedback_type, "thumbsDown")

    def test_create_feedback_assistant_type(self):
        """Test creating feedback for assistant agent type."""
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-003",
                "session_id": "session-assistant",
                "session_type": "assistant",
                "feedback_type": "thumbsUp",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["ok"], True)

    def test_create_feedback_workflow_type(self):
        """Test creating feedback for different session types."""
        for i, session_type in enumerate(["paper", "global", "assistant"]):
            response = self.client.post(
                "/api/feedback",
                json={
                    "message_id": f"msg-{i}",
                    "session_id": f"session-{i}",
                    "session_type": session_type,
                    "feedback_type": "thumbsUp",
                },
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["ok"], True)

        # Verify all were created
        with self.session_factory() as db:
            feedbacks = db.query(MessageFeedback).all()
            self.assertEqual(len(feedbacks), 3)

    def test_create_feedback_various_types(self):
        """Test creating feedback with various session and feedback types."""
        for i, session_type in enumerate(["paper", "global", "assistant"]):
            fb_type = "thumbsUp" if i % 2 == 0 else "thumbsDown"
            response = self.client.post(
                "/api/feedback",
                json={
                    "message_id": f"msg-var-{i}",
                    "session_id": f"session-var-{i}",
                    "session_type": session_type,
                    "feedback_type": fb_type,
                },
            )
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["ok"], True)

        # Verify all created
        with self.session_factory() as db:
            feedbacks = db.query(MessageFeedback).all()
            self.assertEqual(len(feedbacks), 3)

    # -------------------------------------------------------------------------
    # GET /api/feedback/{session_id} - Get session feedback
    # -------------------------------------------------------------------------

    def test_get_feedback_by_session(self):
        """Test getting feedback by session ID."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-001",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-002",
                session_id="session-001",
                session_type="global",
                feedback_type="thumbsDown",
            ))
            db.commit()

        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        message_ids = {item["message_id"] for item in data}
        self.assertIn("msg-001", message_ids)
        self.assertIn("msg-002", message_ids)

    def test_get_feedback_by_session_empty_session(self):
        """Test getting feedback for non-existent session."""
        response = self.client.get("/api/feedback/nonexistent-session")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_get_feedback_multiple_sessions(self):
        """Test getting feedback for multiple sessions."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-001",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-002",
                session_id="session-002",
                session_type="global",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-003",
                session_id="session-003",
                session_type="workflow",
                feedback_type="thumbsUp",
            ))
            db.commit()

        # Each session should return only its own feedback
        response_001 = self.client.get("/api/feedback/session-001")
        self.assertEqual(response_001.status_code, 200)
        data_001 = response_001.json()
        self.assertEqual(len(data_001), 1)
        self.assertEqual(data_001[0]["message_id"], "msg-001")
        self.assertEqual(data_001[0]["feedback_type"], "thumbsUp")

        response_002 = self.client.get("/api/feedback/session-002")
        self.assertEqual(response_002.status_code, 200)
        data_002 = response_002.json()
        self.assertEqual(len(data_002), 1)
        self.assertEqual(data_002[0]["message_id"], "msg-002")

        response_003 = self.client.get("/api/feedback/session-003")
        self.assertEqual(response_003.status_code, 200)
        data_003 = response_003.json()
        self.assertEqual(len(data_003), 1)
        self.assertEqual(data_003[0]["message_id"], "msg-003")
        self.assertEqual(data_003[0]["feedback_type"], "thumbsUp")

    def test_get_feedback_multiple_messages_same_session(self):
        """Test getting feedback across messages in same session with mixed types."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-010",
                session_id="session-multi",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-011",
                session_id="session-multi",
                session_type="paper",
                feedback_type="thumbsDown",
            ))
            db.add(MessageFeedback(
                message_id="msg-012",
                session_id="session-multi",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.commit()

        response = self.client.get("/api/feedback/session-multi")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 3)

        feedback_types = [item["feedback_type"] for item in data]
        self.assertEqual(sorted(feedback_types), ["thumbsDown", "thumbsUp", "thumbsUp"])

    def test_get_feedback_returns_expected_fields(self):
        """Test that get response includes message_id and feedback_type."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-fields",
                session_id="session-fields",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.commit()

        response = self.client.get("/api/feedback/session-fields")
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertIn("message_id", data[0])
        self.assertIn("feedback_type", data[0])
        self.assertEqual(data[0]["message_id"], "msg-fields")
        self.assertEqual(data[0]["feedback_type"], "thumbsUp")


class FeedbackIntegrationTests(unittest.TestCase):
    """Integration tests for feedback workflow."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(feedback_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[feedback_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(MessageFeedback.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_full_feedback_lifecycle(self):
        """Test complete lifecycle: create -> get -> update -> delete."""
        # Create
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-001",
                "session_id": "session-001",
                "session_type": "paper",
                "feedback_type": "thumbsUp",
            },
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["ok"], True)

        # Get and verify
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["message_id"], "msg-001")
        self.assertEqual(response.json()[0]["feedback_type"], "thumbsUp")

        # Update (upsert same message_id + session_id)
        update_response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-001",
                "session_id": "session-001",
                "session_type": "paper",
                "feedback_type": "thumbsDown",
            },
        )
        self.assertEqual(update_response.status_code, 200)
        data = update_response.json()
        self.assertEqual(data["ok"], True)

        # Verify update
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["feedback_type"], "thumbsDown")

        # Delete
        delete_response = self.client.delete("/api/feedback/msg-001")
        self.assertEqual(delete_response.status_code, 200)

        # Verify it is gone
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(len(response.json()), 0)

    def test_multiple_messages_same_session(self):
        """Test creating feedback for multiple messages in the same session."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-001",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-002",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.commit()

        # Both should have same session
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        message_ids = {item["message_id"] for item in data}
        self.assertIn("msg-001", message_ids)
        self.assertIn("msg-002", message_ids)


class FeedbackEdgeCasesTests(unittest.TestCase):
    """Edge case tests for feedback API."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(feedback_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[feedback_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(MessageFeedback.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_feedback_upsert_for_same_message(self):
        """Test that posting feedback for same message+session upserts."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-001",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.commit()

        # Upsert to change feedback_type
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-001",
                "session_id": "session-001",
                "session_type": "paper",
                "feedback_type": "thumbsDown",
            },
        )
        self.assertEqual(response.status_code, 200)

        # Verify upsert replaced thumbsUp with thumbsDown
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["feedback_type"], "thumbsDown")

        # Upsert back to thumbsUp
        response = self.client.post(
            "/api/feedback",
            json={
                "message_id": "msg-001",
                "session_id": "session-001",
                "session_type": "paper",
                "feedback_type": "thumbsUp",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ok"], True)

        # Still only 1 record
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["feedback_type"], "thumbsUp")

    def test_session_isolation(self):
        """Test that feedback is isolated by session."""
        with self.session_factory() as db:
            db.add(MessageFeedback(
                message_id="msg-001",
                session_id="session-001",
                session_type="paper",
                feedback_type="thumbsUp",
            ))
            db.add(MessageFeedback(
                message_id="msg-002",
                session_id="session-002",
                session_type="global",
                feedback_type="thumbsUp",
            ))
            db.commit()

        # Get feedback for session-001 (paper)
        response = self.client.get("/api/feedback/session-001")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["message_id"], "msg-001")
        self.assertEqual(data[0]["feedback_type"], "thumbsUp")

        # Get feedback for session-002 (global)
        response = self.client.get("/api/feedback/session-002")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["message_id"], "msg-002")
        self.assertEqual(response.json()[0]["feedback_type"], "thumbsUp")

        # Delete feedback from session-001
        response = self.client.delete("/api/feedback/msg-001")
        self.assertEqual(response.status_code, 200)

        # Session-002 should be unaffected
        response = self.client.get("/api/feedback/session-002")
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["message_id"], "msg-002")


if __name__ == "__main__":
    unittest.main()
