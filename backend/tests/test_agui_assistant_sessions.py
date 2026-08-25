from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import ANY, patch

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import ChatMessage, GlobalChatSession, Paper
from backend.app.routes import agui as agui_module
from backend.app.services.db_migrations import migrate_database_schema
from backend.app.services.paper_document_text import PaperDocumentText
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text


class AssistantSessionRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(agui_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[agui_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

        now = datetime.now(UTC)
        with self.session_factory() as db:
            paper_a = Paper(title="Paper A", source="local", visibility="public")
            paper_b = Paper(title="Paper B", source="local", visibility="public")
            db.add_all([paper_a, paper_b])
            db.flush()
            self.paper_a_id = paper_a.id
            self.paper_b_id = paper_b.id
            db.add_all([
                GlobalChatSession(
                    session_id="ast-a-old",
                    user_id=1,
                    paper_id=paper_a.id,
                    title="A old",
                    created_at=now - timedelta(days=2),
                    updated_at=now - timedelta(hours=2),
                ),
                GlobalChatSession(
                    session_id="ast-a-new",
                    user_id=1,
                    paper_id=paper_a.id,
                    title="A recent",
                    created_at=now - timedelta(days=1),
                    updated_at=now,
                ),
                GlobalChatSession(
                    session_id="ast-b",
                    user_id=1,
                    paper_id=paper_b.id,
                    title="B session",
                    created_at=now,
                    updated_at=now - timedelta(hours=1),
                ),
                GlobalChatSession(
                    session_id="ast-legacy",
                    user_id=1,
                    paper_id=None,
                    title="Legacy global",
                    created_at=now - timedelta(days=3),
                    updated_at=now - timedelta(days=3),
                ),
            ])
            db.commit()

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(Paper.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_paper_filter_and_global_list_keep_expected_scope_and_order(self):
        paper_response = self.client.get(
            "/api/agui/assistant/sessions",
            params={"paper_id": self.paper_a_id},
        )
        self.assertEqual(paper_response.status_code, 200)
        self.assertEqual(
            [item["session_id"] for item in paper_response.json()],
            ["ast-a-new", "ast-a-old"],
        )
        self.assertTrue(all(
            item["paper_id"] == self.paper_a_id
            and item["paper_title"] == "Paper A"
            for item in paper_response.json()
        ))

        global_response = self.client.get("/api/agui/assistant/sessions")
        self.assertEqual(global_response.status_code, 200)
        records = global_response.json()
        self.assertEqual(
            [item["session_id"] for item in records],
            ["ast-a-new", "ast-b", "ast-a-old", "ast-legacy"],
        )
        legacy = next(item for item in records if item["session_id"] == "ast-legacy")
        self.assertIsNone(legacy["paper_id"])
        self.assertIsNone(legacy["paper_title"])

    def test_session_resolution_binds_new_session_and_rejects_cross_paper_reuse(self):
        user = make_fake_user()
        with self.session_factory() as db:
            session, paper = agui_module._resolve_assistant_session(
                db,
                user,
                "ast-new-paper",
                [{"role": "user", "content": "Analyze this paper"}],
                self.paper_a_id,
            )
            self.assertEqual(session.paper_id, self.paper_a_id)
            self.assertEqual(paper.id, self.paper_a_id)

            session, paper = agui_module._resolve_assistant_session(
                db,
                user,
                "ast-new-paper",
                [{"role": "user", "content": "Continue"}],
                None,
            )
            self.assertEqual(session.paper_id, self.paper_a_id)
            self.assertEqual(paper.id, self.paper_a_id)

            with self.assertRaises(HTTPException) as raised:
                agui_module._resolve_assistant_session(
                    db,
                    user,
                    "ast-new-paper",
                    [{"role": "user", "content": "Wrong paper"}],
                    self.paper_b_id,
                )
            self.assertEqual(raised.exception.status_code, 409)

    def test_global_list_excludes_paper_sessions_outside_user_visibility(self):
        regular_user = make_fake_user()
        regular_user.id = 2
        regular_user.role = "user"
        regular_user.department_id = 2
        regular_user.department = type("Department", (), {"status": "active"})()

        with self.session_factory() as db:
            hidden_paper = Paper(
                title="Hidden department paper",
                source="local",
                visibility="department",
                department_id=1,
            )
            db.add(hidden_paper)
            db.flush()
            hidden_paper_id = hidden_paper.id
            db.add_all([
                GlobalChatSession(
                    session_id="ast-user-public",
                    user_id=2,
                    paper_id=self.paper_a_id,
                    title="Visible paper session",
                ),
                GlobalChatSession(
                    session_id="ast-user-hidden",
                    user_id=2,
                    paper_id=hidden_paper.id,
                    title="Hidden paper session",
                ),
            ])
            db.commit()

        self.app.dependency_overrides[get_current_user] = lambda: regular_user
        response = self.client.get("/api/agui/assistant/sessions")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["session_id"] for item in response.json()],
            ["ast-user-public"],
        )
        hidden_response = self.client.get(
            "/api/agui/assistant/sessions",
            params={"paper_id": hidden_paper_id},
        )
        self.assertEqual(hidden_response.status_code, 404)

    def test_global_continuation_restores_bound_paper_context_and_updates_activity(self):
        captured_configs = []
        with self.session_factory() as db:
            previous_updated_at = db.query(GlobalChatSession).filter_by(
                session_id="ast-a-old",
            ).one().updated_at

        async def fake_run(agent_config, _messages, _encoder, _thread_id, _run_id, _db):
            captured_configs.append(agent_config)
            yield "{}\n"

        body = {
            "threadId": "ast-a-old",
            "runId": "run-global-continue",
            "messages": [{"role": "user", "content": "Continue the analysis"}],
            "forwardedProps": {
                "assistantSessionId": "ast-a-old",
                "assistantScope": "global",
                "paperId": self.paper_b_id,
            },
        }
        with patch.object(agui_module, "_resolve_config_or_error", return_value=(object(), None)), \
             patch.object(agui_module, "get_system_prompt", return_value="Assistant prompt"), \
             patch.object(agui_module, "get_tools_for_agent", return_value=([], None)), \
             patch.object(agui_module, "run_chat_agent", side_effect=fake_run):
            response = self.client.post(
                "/api/agui/assistant",
                json=body,
                headers={"accept": "application/jsonl"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Paper A", captured_configs[-1].system_prompt)
        self.assertIn("Paper A", captured_configs[-1].context_messages[0])
        with self.session_factory() as db:
            session = db.query(GlobalChatSession).filter_by(session_id="ast-a-old").one()
            self.assertGreater(session.updated_at, previous_updated_at)

    def test_cross_paper_post_is_rejected_before_streaming(self):
        response = self.client.post(
            "/api/agui/assistant",
            json={
                "threadId": "ast-a-new",
                "runId": "run-mismatch",
                "messages": [{"role": "user", "content": "Wrong paper"}],
                "forwardedProps": {
                    "assistantSessionId": "ast-a-new",
                    "assistantScope": "paper",
                    "paperId": self.paper_b_id,
                },
            },
        )
        self.assertEqual(response.status_code, 409)

    def test_translation_request_injects_original_pdf_and_scoped_reader_tool(self):
        captured_configs = []
        document = PaperDocumentText(
            file_id=17,
            filename="current-paper.pdf",
            text="UNIQUE ORIGINAL PDF BODY",
            source="pdf_text_layer",
            total_pages=9,
            start_page=1,
            last_page=4,
            has_more_pages=True,
            next_page=5,
            next_page_char_offset=0,
        )

        async def fake_run(agent_config, _messages, _encoder, _thread_id, _run_id, _db):
            captured_configs.append(agent_config)
            yield "{}\n"

        body = {
            "threadId": "ast-auto-translate",
            "runId": "run-auto-translate",
            "messages": [{"role": "user", "content": "请翻译这篇论文"}],
            "forwardedProps": {
                "assistantSessionId": "ast-auto-translate",
                "assistantScope": "paper",
                "paperId": self.paper_a_id,
                "pdfActiveFileId": 17,
            },
        }
        with patch.object(agui_module, "load_paper_document_text", return_value=document) as loader, \
             patch.object(agui_module, "_resolve_config_or_error", return_value=(object(), None)), \
             patch.object(agui_module, "get_system_prompt", return_value="Assistant prompt"), \
             patch.object(agui_module, "get_tools_for_agent", return_value=([], None)), \
             patch.object(agui_module, "run_chat_agent", side_effect=fake_run):
            response = self.client.post(
                "/api/agui/assistant",
                json=body,
                headers={"accept": "application/jsonl"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(captured_configs), 1)
        config = captured_configs[0]
        self.assertEqual(config.paper_id, self.paper_a_id)
        self.assertNotIn("UNIQUE ORIGINAL PDF BODY", config.system_prompt)
        self.assertIn("UNIQUE ORIGINAL PDF BODY", config.context_messages[0])
        self.assertIn("当前用户请求已被识别为当前论文翻译任务", config.system_prompt)
        self.assertEqual(config.pdf_cursor_checkpoint["next_start_page"], 5)
        self.assertIn(
            "read_current_paper_pdf",
            [item["function"]["name"] for item in config.tool_defs],
        )
        loader.assert_called_once_with(
            ANY,
            self.paper_a_id,
            preferred_file_id=17,
            page_count=16,
            max_chars=32_000,
        )
        self.assertEqual(
            [item["function"]["name"] for item in config.tool_defs],
            ["read_current_paper_pdf"],
        )

    def test_consecutive_continue_restores_latest_redacted_pdf_cursor(self):
        tool_result = json.dumps({
            "type": "current_paper_pdf",
            "data": {
                "paper_id": self.paper_a_id,
                "file_id": 17,
                "has_more": True,
                "next_start_page": 9,
                "next_page_char_offset": 321,
                "next_text_offset": None,
                "text_omitted": True,
            },
        }, ensure_ascii=False)
        with self.session_factory() as db:
            db.add_all([
                ChatMessage(
                    session_id="ast-a-new",
                    user_id=1,
                    session_type="assistant",
                    role="user",
                    content="请翻译这篇论文",
                ),
                ChatMessage(
                    session_id="ast-a-new",
                    user_id=1,
                    session_type="assistant",
                    role="user",
                    content="继续",
                ),
                ChatMessage(
                    session_id="ast-a-new",
                    user_id=1,
                    session_type="assistant",
                    role="tool",
                    content=json.dumps({
                        "tool_call_id": "cursor-call",
                        "name": "read_current_paper_pdf",
                        "args": "{}",
                        "result": tool_result,
                    }, ensure_ascii=False),
                ),
            ])
            db.commit()

        document = PaperDocumentText(
            file_id=17,
            filename="current-paper.pdf",
            text="RESUMED ORIGINAL PDF BODY",
            source="pdf_text_layer",
            total_pages=20,
            start_page=9,
            last_page=12,
            has_more_pages=True,
            next_page=13,
            next_page_char_offset=0,
        )
        captured_configs = []

        async def fake_run(agent_config, _messages, _encoder, _thread_id, _run_id, _db):
            captured_configs.append(agent_config)
            yield "{}\n"

        with patch.object(agui_module, "load_paper_document_text", return_value=document) as loader, \
             patch.object(agui_module, "_resolve_config_or_error", return_value=(object(), None)), \
             patch.object(agui_module, "get_system_prompt", return_value="Assistant prompt"), \
             patch.object(agui_module, "get_tools_for_agent", return_value=([], None)), \
             patch.object(agui_module, "run_chat_agent", side_effect=fake_run):
            response = self.client.post(
                "/api/agui/assistant",
                json={
                    "threadId": "ast-a-new",
                    "runId": "run-third-continue",
                    "messages": [{"role": "user", "content": "继续"}],
                    "forwardedProps": {
                        "assistantSessionId": "ast-a-new",
                        "assistantScope": "paper",
                        "paperId": self.paper_a_id,
                        "pdfActiveFileId": 17,
                    },
                },
                headers={"accept": "application/jsonl"},
            )

        self.assertEqual(response.status_code, 200)
        loader.assert_called_once_with(
            ANY,
            self.paper_a_id,
            preferred_file_id=17,
            page_count=16,
            max_chars=32_000,
            start_page=9,
            page_char_offset=321,
        )
        self.assertIn("RESUMED ORIGINAL PDF BODY", captured_configs[0].context_messages[0])
        self.assertIn(
            "当前用户请求已被识别为当前论文翻译任务",
            captured_configs[0].system_prompt,
        )

    def test_terminal_tool_cursor_replays_its_last_long_page_offset_from_db(self):
        tool_result = json.dumps({
            "type": "current_paper_pdf",
            "data": {
                "paper_id": self.paper_a_id,
                "file_id": 17,
                "source": "pdf_text_layer",
                "start_page": 9,
                "has_more": False,
                "next_start_page": None,
                "text_omitted": True,
            },
        }, ensure_ascii=False)
        with self.session_factory() as db:
            db.add_all([
                ChatMessage(
                    session_id="ast-a-new",
                    user_id=1,
                    session_type="assistant",
                    role="user",
                    content="请翻译这篇论文",
                ),
                ChatMessage(
                    session_id="ast-a-new",
                    user_id=1,
                    session_type="assistant",
                    role="tool",
                    content=json.dumps({
                        "tool_call_id": "terminal-cursor-call",
                        "name": "read_current_paper_pdf",
                        "resume_eligible": True,
                        "args": json.dumps({
                            "start_page": 9,
                            "page_char_offset": 321,
                        }),
                        "result": tool_result,
                    }, ensure_ascii=False),
                ),
            ])
            db.commit()

        document = PaperDocumentText(
            file_id=17,
            filename="current-paper.pdf",
            text="FINAL LONG PAGE TAIL",
            source="pdf_text_layer",
            total_pages=9,
            start_page=9,
            last_page=9,
            has_more_pages=False,
        )
        captured_configs = []

        async def fake_run(agent_config, _messages, _encoder, _thread_id, _run_id, _db):
            captured_configs.append(agent_config)
            yield "{}\n"

        with patch.object(agui_module, "load_paper_document_text", return_value=document) as loader, \
             patch.object(agui_module, "_resolve_config_or_error", return_value=(object(), None)), \
             patch.object(agui_module, "get_system_prompt", return_value="Assistant prompt"), \
             patch.object(agui_module, "get_tools_for_agent", return_value=([], None)), \
             patch.object(agui_module, "run_chat_agent", side_effect=fake_run):
            response = self.client.post(
                "/api/agui/assistant",
                json={
                    "threadId": "ast-a-new",
                    "runId": "run-terminal-continue",
                    "messages": [{"role": "user", "content": "继续"}],
                    "forwardedProps": {
                        "assistantSessionId": "ast-a-new",
                        "assistantScope": "paper",
                        "paperId": self.paper_a_id,
                        "pdfActiveFileId": 17,
                    },
                },
                headers={"accept": "application/jsonl"},
            )

        self.assertEqual(response.status_code, 200)
        loader.assert_called_once_with(
            ANY,
            self.paper_a_id,
            preferred_file_id=17,
            page_count=16,
            max_chars=32_000,
            start_page=9,
            page_char_offset=321,
        )
        self.assertIn("FINAL LONG PAGE TAIL", captured_configs[0].context_messages[0])
        self.assertIn("不要从第一页重新开始", captured_configs[0].context_messages[0])


class AssistantSessionMigrationTests(unittest.TestCase):
    def test_migration_is_idempotent_and_preserves_unassigned_legacy_sessions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "paper_tracker.db"
            engine = create_engine(f"sqlite:///{database_path}")
            try:
                with engine.begin() as connection:
                    connection.execute(text("""
                        CREATE TABLE global_chat_sessions (
                            id INTEGER PRIMARY KEY,
                            session_id VARCHAR(64) UNIQUE NOT NULL,
                            user_id INTEGER,
                            title VARCHAR(256),
                            created_at DATETIME
                        )
                    """))
                    connection.execute(text("""
                        INSERT INTO global_chat_sessions (
                            id, session_id, user_id, title, created_at
                        ) VALUES (
                            1, 'ast-legacy', 1, 'Legacy', '2026-07-01 00:00:00'
                        )
                    """))

                migrate_database_schema(engine)
                migrate_database_schema(engine)

                columns = {
                    column["name"]
                    for column in inspect(engine).get_columns("global_chat_sessions")
                }
                self.assertIn("paper_id", columns)
                self.assertIn("updated_at", columns)
                with engine.connect() as connection:
                    row = connection.execute(text(
                        "SELECT paper_id, created_at, updated_at "
                        "FROM global_chat_sessions WHERE session_id='ast-legacy'"
                    )).one()
                self.assertIsNone(row.paper_id)
                self.assertEqual(str(row.created_at), str(row.updated_at))
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
