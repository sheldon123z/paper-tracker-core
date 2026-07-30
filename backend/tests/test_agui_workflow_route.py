from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import ChatMessage, Paper, WorkflowSession
from backend.app.routes import agui as agui_module
from backend.app.routes import agui_workflow as agui_workflow_module
from backend.app.services.llm_registry import ResolvedLLMConfig
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from sqlalchemy.orm import Session as SQLAlchemySession


class _FakeLLM:
    async def ainvoke(self, _messages):
        return AIMessage(
            content=(
                "# Workflow 报告\n\n"
                "## 研究观察\n- 当前趋势集中在 retrieval 与 grounded generation。\n\n"
                "## 建议\n- 补充近两年 benchmark。\n\n"
                "## 后续问题\n- 是否需要进一步筛选企业场景论文？"
            )
        )


class _FakeCheckpointer:
    def __init__(self, error: Exception | None = None):
        self.deleted_threads = []
        self.error = error

    async def adelete_thread(self, thread_id: str):
        if self.error is not None:
            raise self.error
        self.deleted_threads.append(thread_id)


class WorkflowHeartbeatTests(unittest.IsolatedAsyncioTestCase):
    async def test_heartbeat_keeps_silent_graph_run_active(self):
        async def delayed_events():
            import asyncio

            await asyncio.sleep(0.02)
            yield {"event": "on_chain_end", "name": "synthesis_agent", "data": {}}

        events = []
        async for event in agui_workflow_module._with_workflow_heartbeat(
            delayed_events(),
            interval_seconds=0.005,
        ):
            events.append(event)

        self.assertIn({"event": "workflow_heartbeat"}, events)
        self.assertEqual(events[-1]["event"], "on_chain_end")


class WorkflowRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(agui_module.router)
        self.app.include_router(agui_workflow_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[agui_module.get_db] = override_get_db
        self.app.dependency_overrides[agui_workflow_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)

        with self.session_factory() as db:
            db.add_all(
                [
                    Paper(
                        title="RAG Benchmarking for Enterprise Search",
                        authors="Alice, Bob",
                        abstract="This paper studies retrieval augmented generation systems with transformer baselines.",
                        source="rss",
                        published_date=datetime(2025, 5, 1),
                        relevance=3.5,
                        category="cs.CL",
                    ),
                    Paper(
                        title="Adaptive Retrieval for Long Context QA",
                        authors="Carol, Dave",
                        abstract="We present an adaptive retrieval strategy for long context question answering with LLM agents.",
                        source="rss",
                        published_date=datetime(2024, 10, 1),
                        relevance=3.2,
                        category="cs.AI",
                    ),
                ]
            )
            db.commit()

    def tearDown(self):
        self.app.dependency_overrides.clear()
        with self.session_factory() as db:
            for table in reversed(Paper.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()

    def test_workflow_stream_emits_snapshots_and_final_report(self):
        resolved = ResolvedLLMConfig(
            provider_key="openai",
            display_name="OpenAI",
            model_name="gpt-4o-mini",
            litellm_model="openai/gpt-4o-mini",
            api_key="sk-test",
            api_base="https://api.openai.com/v1",
            extra_headers={},
            model_kwargs={},
            api_format="native",
            is_local=False,
            supports_streaming=True,
            supports_tool_calling=True,
            supports_reasoning=True,
            supports_vision=True,
            config_id=1,
        )

        with patch.object(agui_workflow_module, "resolve_llm_config", return_value=resolved), \
             patch.object(agui_workflow_module, "get_checkpointer", return_value=None), \
             patch("backend.app.services.workflow_graph.build_chat_llm", return_value=_FakeLLM()):
            response = self.client.post(
                "/api/agui/workflow",
                json={
                    "threadId": "wf-test",
                    "runId": "run-test",
                    "messages": [{"role": "user", "content": "请帮我做 RAG 趋势分析"}],
                    "forwardedProps": {
                        "configId": 1,
                        "templateId": "trend_radar",
                        "templateParams": {
                            "topic": "RAG 检索增强生成",
                            "timeRange": "近5年",
                            "sources": ["本地论文库"],
                        },
                    },
                },
                headers={"accept": "application/jsonl"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.text
        self.assertIn("STATE_SNAPSHOT", payload)
        self.assertIn("文献检索已完成", payload)
        self.assertIn("TOOL_CALL_START", payload)
        self.assertIn("Workflow 报告", payload)
        self.assertNotIn("wf-test", agui_workflow_module._active_workflow_sessions)

        with self.session_factory() as db:
            session = db.query(WorkflowSession).filter(WorkflowSession.session_id == "wf-test").first()
            self.assertIsNotNone(session)
            self.assertEqual(session.workflow_status, "completed")
            self.assertEqual(session.template_id, "trend_radar")
            self.assertGreaterEqual(
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == "wf-test", ChatMessage.session_type == "workflow")
                .count(),
                3,
            )

    def test_workflow_session_endpoints_restore_metadata_and_messages(self):
        resolved = ResolvedLLMConfig(
            provider_key="openai",
            display_name="OpenAI",
            model_name="gpt-4o-mini",
            litellm_model="openai/gpt-4o-mini",
            api_key="sk-test",
            api_base="https://api.openai.com/v1",
            extra_headers={},
            model_kwargs={},
            api_format="native",
            is_local=False,
            supports_streaming=True,
            supports_tool_calling=True,
            supports_reasoning=True,
            supports_vision=True,
            config_id=1,
        )

        with patch.object(agui_workflow_module, "resolve_llm_config", return_value=resolved), \
             patch.object(agui_workflow_module, "get_checkpointer", return_value=None), \
             patch("backend.app.services.workflow_graph.build_chat_llm", return_value=_FakeLLM()):
            self.client.post(
                "/api/agui/workflow",
                json={
                    "threadId": "wf-restore",
                    "runId": "run-restore",
                    "messages": [{"role": "user", "content": "请帮我做 RAG 趋势分析"}],
                    "forwardedProps": {
                        "configId": 1,
                        "workflowSessionId": "wf-restore",
                        "templateId": "trend_radar",
                        "templateParams": {
                            "topic": "RAG 检索增强生成",
                            "timeRange": "近5年",
                            "sources": ["本地论文库"],
                        },
                    },
                },
                headers={"accept": "application/jsonl"},
            )

        sessions = self.client.get("/api/agui/workflow/sessions")
        self.assertEqual(sessions.status_code, 200)
        self.assertIn("wf-restore", sessions.text)

        detail = self.client.get("/api/agui/workflow/wf-restore")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["template_id"], "trend_radar")
        self.assertEqual(detail.json()["state_snapshot"]["workflow_status"], "completed")
        self.assertEqual(detail.json()["state_snapshot"]["llm_config_id"], 1)

        messages = self.client.get("/api/agui/workflow/wf-restore/messages")
        self.assertEqual(messages.status_code, 200)
        roles = [item["role"] for item in messages.json()]
        self.assertIn("user", roles)
        self.assertIn("assistant", roles)
        self.assertIn("tool", roles)

    def test_delete_workflow_removes_owned_session_messages_and_checkpoints(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-delete",
                user_id=1,
                title="Delete me",
                template_id="literature_survey",
            ))
            db.add_all([
                ChatMessage(
                    session_id="wf-delete",
                    user_id=1,
                    session_type="workflow",
                    role="user",
                    content="workflow message",
                ),
                ChatMessage(
                    session_id="wf-delete",
                    user_id=1,
                    session_type="assistant",
                    role="assistant",
                    content="unrelated message",
                ),
            ])
            db.commit()

        checkpointer = _FakeCheckpointer()
        with patch.object(agui_workflow_module, "get_checkpointer", return_value=checkpointer):
            response = self.client.delete("/api/agui/workflow/wf-delete")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["deleted_messages"], 1)
        self.assertEqual(checkpointer.deleted_threads, ["wf-delete"])
        with self.session_factory() as db:
            self.assertIsNone(
                db.query(WorkflowSession)
                .filter(WorkflowSession.session_id == "wf-delete")
                .first()
            )
            self.assertEqual(
                db.query(ChatMessage)
                .filter(
                    ChatMessage.session_id == "wf-delete",
                    ChatMessage.session_type == "workflow",
                )
                .count(),
                0,
            )
            self.assertEqual(
                db.query(ChatMessage)
                .filter(
                    ChatMessage.session_id == "wf-delete",
                    ChatMessage.session_type == "assistant",
                )
                .count(),
                1,
            )

    def test_delete_workflow_does_not_disclose_or_remove_another_users_session(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-foreign",
                user_id=2,
                title="Foreign session",
                template_id="literature_survey",
            ))
            db.add(ChatMessage(
                session_id="wf-foreign",
                user_id=2,
                session_type="workflow",
                role="user",
                content="private workflow message",
            ))
            db.commit()

        checkpointer = _FakeCheckpointer()
        with patch.object(agui_workflow_module, "get_checkpointer", return_value=checkpointer):
            response = self.client.delete("/api/agui/workflow/wf-foreign")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Workflow session not found"})
        self.assertEqual(checkpointer.deleted_threads, [])
        with self.session_factory() as db:
            self.assertIsNotNone(
                db.query(WorkflowSession)
                .filter(WorkflowSession.session_id == "wf-foreign")
                .first()
            )
            self.assertEqual(
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == "wf-foreign")
                .count(),
                1,
            )

    def test_delete_workflow_keeps_primary_records_when_checkpoint_cleanup_fails(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-cleanup-failure",
                user_id=1,
                title="Retry later",
                template_id="literature_survey",
            ))
            db.add(ChatMessage(
                session_id="wf-cleanup-failure",
                user_id=1,
                session_type="workflow",
                role="user",
                content="keep until cleanup succeeds",
            ))
            db.commit()

        checkpointer = _FakeCheckpointer(RuntimeError("checkpoint unavailable"))
        with patch.object(agui_workflow_module, "get_checkpointer", return_value=checkpointer):
            response = self.client.delete("/api/agui/workflow/wf-cleanup-failure")

        self.assertEqual(response.status_code, 503)
        with self.session_factory() as db:
            session = (
                db.query(WorkflowSession)
                .filter(WorkflowSession.session_id == "wf-cleanup-failure")
                .first()
            )
            self.assertIsNotNone(session)
            self.assertEqual(session.workflow_status, "deleting")
            self.assertEqual(
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == "wf-cleanup-failure")
                .count(),
                1,
            )

        retry_checkpointer = _FakeCheckpointer()
        with patch.object(agui_workflow_module, "get_checkpointer", return_value=retry_checkpointer):
            retry = self.client.delete("/api/agui/workflow/wf-cleanup-failure")

        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry_checkpointer.deleted_threads, ["wf-cleanup-failure"])

    def test_delete_workflow_leaves_retryable_tombstone_when_primary_commit_fails(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-primary-failure",
                user_id=1,
                title="Primary commit failure",
                template_id="literature_survey",
            ))
            db.add(ChatMessage(
                session_id="wf-primary-failure",
                user_id=1,
                session_type="workflow",
                role="user",
                content="retain for retry",
            ))
            db.commit()

        checkpointer = _FakeCheckpointer()
        original_commit = SQLAlchemySession.commit
        commit_calls = []

        def fail_second_commit(session):
            commit_calls.append(1)
            if len(commit_calls) == 2:
                raise RuntimeError("primary delete commit failed")
            return original_commit(session)

        with patch.object(agui_workflow_module, "get_checkpointer", return_value=checkpointer), \
             patch.object(SQLAlchemySession, "commit", new=fail_second_commit), \
             self.assertRaisesRegex(RuntimeError, "primary delete commit failed"):
            self.client.delete("/api/agui/workflow/wf-primary-failure")

        self.assertEqual(checkpointer.deleted_threads, ["wf-primary-failure"])
        with self.session_factory() as db:
            session = (
                db.query(WorkflowSession)
                .filter(WorkflowSession.session_id == "wf-primary-failure")
                .first()
            )
            self.assertIsNotNone(session)
            self.assertEqual(session.workflow_status, "deleting")
            self.assertEqual(
                db.query(ChatMessage)
                .filter(ChatMessage.session_id == "wf-primary-failure")
                .count(),
                1,
            )

    def test_deleting_workflow_cannot_be_restored_or_run(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-deleting",
                user_id=1,
                title="Pending deletion",
                template_id="literature_survey",
                workflow_status="deleting",
            ))
            db.commit()

        detail = self.client.get("/api/agui/workflow/wf-deleting")
        messages = self.client.get("/api/agui/workflow/wf-deleting/messages")
        run = self.client.post(
            "/api/agui/workflow",
            json={
                "threadId": "wf-deleting",
                "runId": "run-deleting",
                "messages": [{"role": "user", "content": "resume"}],
                "forwardedProps": {
                    "workflowSessionId": "wf-deleting",
                    "templateId": "literature_survey",
                },
            },
            headers={"accept": "application/jsonl"},
        )

        self.assertEqual(detail.status_code, 409)
        self.assertEqual(messages.status_code, 409)
        self.assertEqual(run.status_code, 409)

    def test_delete_workflow_rejects_an_active_session(self):
        with self.session_factory() as db:
            db.add(WorkflowSession(
                session_id="wf-active",
                user_id=1,
                title="Still running",
                template_id="literature_survey",
            ))
            db.commit()

        agui_workflow_module._active_workflow_sessions["wf-active"] = 1
        try:
            response = self.client.delete("/api/agui/workflow/wf-active")
        finally:
            agui_workflow_module._active_workflow_sessions.pop("wf-active", None)

        self.assertEqual(response.status_code, 409)
        self.assertIn("仍在运行", response.json()["detail"])
