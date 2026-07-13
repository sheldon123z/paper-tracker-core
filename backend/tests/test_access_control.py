import json
import unittest
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.database import Base
from backend.app.models import Paper, PaperUserState
from backend.app.services.access_control import (
    filter_visible,
    get_user_state,
    get_visible_or_404,
    normalize_new_scope,
    paper_response,
    require_writable,
    scope_session,
)
from backend.app.services.tools.paper_tools import _execute_get_paper_notes
from backend.app.services.tools.stats_tools import _execute_get_research_stats


def principal(user_id, *, role="user", department_id=1, department_status="active"):
    department = None if department_id is None else SimpleNamespace(id=department_id, status=department_status)
    return SimpleNamespace(
        id=user_id,
        role=role,
        department_id=department_id,
        department=department,
    )


class AccessControlMatrixTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.public = Paper(title="Public", link="public", visibility="public")
        self.department_one = Paper(title="D1", link="d1", visibility="department", department_id=1)
        self.department_two = Paper(title="D2", link="d2", visibility="department", department_id=2)
        self.db.add_all([self.public, self.department_one, self.department_two])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_manager_sees_all_departments(self):
        visible = filter_visible(self.db.query(Paper), Paper, principal(1, role="manager", department_id=None)).all()
        self.assertEqual({paper.title for paper in visible}, {"Public", "D1", "D2"})

    def test_department_account_sees_public_and_own_department(self):
        visible = filter_visible(self.db.query(Paper), Paper, principal(10)).all()
        self.assertEqual({paper.title for paper in visible}, {"Public", "D1"})

    def test_foreign_department_id_is_hidden_as_404(self):
        with self.assertRaises(HTTPException) as raised:
            get_visible_or_404(self.db, Paper, self.department_two.id, principal(10))
        self.assertEqual(raised.exception.status_code, 404)

    def test_unassigned_account_cannot_query_library(self):
        with self.assertRaises(HTTPException) as raised:
            filter_visible(self.db.query(Paper), Paper, principal(10, department_id=None)).all()
        self.assertEqual(raised.exception.status_code, 403)

    def test_disabled_department_cannot_query_library(self):
        with self.assertRaises(HTTPException) as raised:
            filter_visible(
                self.db.query(Paper), Paper,
                principal(10, department_status="disabled"),
            ).all()
        self.assertEqual(raised.exception.status_code, 403)

    def test_public_is_read_only_but_own_department_is_writable(self):
        with self.assertRaises(HTTPException) as raised:
            require_writable(self.public, principal(10))
        self.assertEqual(raised.exception.status_code, 403)
        require_writable(self.department_one, principal(10))

    def test_manager_can_write_all_scopes(self):
        manager = principal(1, role="manager", department_id=None)
        require_writable(self.public, manager)
        require_writable(self.department_two, manager)

    def test_normal_account_creation_is_forced_to_own_department(self):
        self.assertEqual(normalize_new_scope(principal(10), "public", 2), ("department", 1))

    def test_manager_scope_validation_requires_department_for_private_data(self):
        manager = principal(1, role="manager", department_id=None)
        self.assertEqual(normalize_new_scope(manager, "public", 2), ("public", None))
        with self.assertRaises(HTTPException) as raised:
            normalize_new_scope(manager, "department", None)
        self.assertEqual(raised.exception.status_code, 400)

    def test_personal_state_is_isolated_on_the_same_public_paper(self):
        self.db.add(PaperUserState(
            paper_id=self.public.id, user_id=10, is_read=True,
            is_favorited=True, notes="user ten",
        ))
        self.db.commit()
        first = paper_response(self.db, self.public, principal(10))
        second = paper_response(self.db, self.public, principal(11))
        self.assertTrue(first["is_read"])
        self.assertTrue(first["is_favorited"])
        self.assertEqual(first["notes"], "user ten")
        self.assertFalse(second["is_read"])
        self.assertFalse(second["is_favorited"])
        self.assertEqual(second["notes"], "")

    def test_scoped_session_filters_ai_tool_queries(self):
        scoped_db = self.Session()
        try:
            scope_session(scoped_db, principal(10))
            self.assertEqual(
                {paper.title for paper in scoped_db.query(Paper).all()},
                {"Public", "D1"},
            )
        finally:
            scoped_db.close()

    def test_user_state_unique_per_paper_and_user(self):
        state = get_user_state(self.db, self.public.id, 10, create=True)
        self.db.commit()
        self.assertEqual(get_user_state(self.db, self.public.id, 10).id, state.id)

    def test_ai_tools_use_the_calling_accounts_personal_state(self):
        self.db.add(PaperUserState(
            paper_id=self.public.id,
            user_id=10,
            is_read=True,
            is_favorited=True,
            notes="private note",
        ))
        self.db.commit()

        first_db = self.Session()
        second_db = self.Session()
        try:
            scope_session(first_db, principal(10))
            scope_session(second_db, principal(11))
            first_notes = json.loads(_execute_get_paper_notes(
                first_db, {"paper_id": self.public.id},
            ))
            second_notes = json.loads(_execute_get_paper_notes(
                second_db, {"paper_id": self.public.id},
            ))
            first_stats = json.loads(_execute_get_research_stats(first_db, {}))["data"]
            second_stats = json.loads(_execute_get_research_stats(second_db, {}))["data"]
            self.assertEqual(first_notes["data"][0]["notes"], "private note")
            self.assertEqual(second_notes["data"][0]["notes"], "")
            self.assertEqual((first_stats["unread"], first_stats["favorited"]), (1, 1))
            self.assertEqual((second_stats["unread"], second_stats["favorited"]), (2, 0))
        finally:
            first_db.close()
            second_db.close()


if __name__ == "__main__":
    unittest.main()
