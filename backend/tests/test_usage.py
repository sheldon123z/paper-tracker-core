"""Comprehensive tests for LLM usage statistics API routes.

Tests cover: summary, by-model, by-agent, timeline, recent, audit, and cost endpoints.
"""

from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

import backend.tests  # noqa: F401
from backend.app.auth.dependencies import get_current_user
from backend.app.models import LLMConfig, LLMUsageLog
from backend.app.routes import usage as usage_module
from backend.tests.support import make_fake_user, make_test_session_factory
from fastapi import FastAPI
from fastapi.testclient import TestClient


class UsageTestBase(unittest.TestCase):
    """Base class with a test FastAPI app and in-memory DB."""

    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(usage_module.router)

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app.dependency_overrides[usage_module.get_db] = override_get_db
        self.app.dependency_overrides[get_current_user] = make_fake_user
        self.client = TestClient(self.app)
        self.db = self.session_factory()

    def tearDown(self):
        self.app.dependency_overrides.clear()
        # Clean tables
        self.db.query(LLMUsageLog).delete()
        self.db.query(LLMConfig).delete()
        self.db.commit()
        self.db.close()

    def _create_config(
        self,
        provider="openai",
        model_name="gpt-4o",
        display_name="GPT-4o",
        is_local=False,
    ):
        """Helper to create an LLMConfig for testing."""
        config = LLMConfig(
            provider=provider,
            model_name=model_name,
            display_name=display_name,
            api_key_encrypted="encrypted-key",
            is_enabled=True,
            is_local=is_local,
        )
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def _create_usage_log(
        self,
        config_id=None,
        provider="openai",
        model_name="gpt-4o",
        agent_type="paper",
        session_id=None,
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        duration_ms=500,
        ttft_ms=200,
        tokens_per_second=250.0,
        tool_calls_count=0,
        status="success",
        error_code=None,
        created_at=None,
    ):
        """Helper to create an LLMUsageLog for testing."""
        log = LLMUsageLog(
            config_id=config_id,
            provider=provider,
            model_name=model_name,
            agent_type=agent_type,
            session_id=session_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            duration_ms=duration_ms,
            ttft_ms=ttft_ms,
            tokens_per_second=tokens_per_second,
            tool_calls_count=tool_calls_count,
            status=status,
            error_code=error_code,
            created_at=created_at or datetime.now(UTC),
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log


class UsageSummaryTests(UsageTestBase):
    """Tests for GET /api/usage/summary endpoint."""

    def test_summary_empty(self):
        """Test summary with no usage data."""
        response = self.client.get("/api/usage/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_calls"], 0)
        self.assertEqual(data["total_prompt_tokens"], 0)
        self.assertEqual(data["total_completion_tokens"], 0)
        self.assertEqual(data["total_tokens"], 0)
        self.assertEqual(data["avg_duration_ms"], 0.0)
        self.assertIsNone(data["avg_ttft_ms"])
        self.assertIsNone(data["avg_tokens_per_second"])
        self.assertEqual(data["error_count"], 0)
        self.assertEqual(data["period_days"], 30)

    def test_summary_with_data(self):
        """Test summary with usage data."""
        config = self._create_config()
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=200,
            completion_tokens=100,
            total_tokens=300,
            duration_ms=1000,
            ttft_ms=300,
            tokens_per_second=100.0,
        )
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            duration_ms=500,
            ttft_ms=150,
            tokens_per_second=333.33,
        )

        response = self.client.get("/api/usage/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_calls"], 2)
        self.assertEqual(data["total_prompt_tokens"], 300)
        self.assertEqual(data["total_completion_tokens"], 150)
        self.assertEqual(data["total_tokens"], 450)
        self.assertEqual(data["avg_duration_ms"], 750.0)
        self.assertEqual(data["avg_ttft_ms"], 225.0)
        self.assertAlmostEqual(data["avg_tokens_per_second"], 216.67, places=1)
        self.assertEqual(data["error_count"], 0)

    def test_summary_with_days_filter(self):
        """Test summary with days filter."""
        config = self._create_config()

        # Recent log (within 7 days)
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=100,
            total_tokens=150,
            created_at=datetime.now(UTC) - timedelta(days=3),
        )

        # Old log (outside 7 days)
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=500,
            total_tokens=600,
            created_at=datetime.now(UTC) - timedelta(days=10),
        )

        response = self.client.get("/api/usage/summary?days=7")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_calls"], 1)
        self.assertEqual(data["total_prompt_tokens"], 100)
        self.assertEqual(data["period_days"], 7)

    def test_summary_with_config_filter(self):
        """Test summary filtered by config_id."""
        config1 = self._create_config(model_name="gpt-4o")
        config2 = self._create_config(model_name="gpt-4o-mini", display_name="GPT-4o Mini")

        self._create_usage_log(
            config_id=config1.id,
            prompt_tokens=200,
            completion_tokens=100,
            total_tokens=300,
            duration_ms=1000,
        )
        self._create_usage_log(
            config_id=config2.id,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            duration_ms=500,
        )

        response = self.client.get(f"/api/usage/summary?config_id={config1.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_calls"], 1)
        self.assertEqual(data["total_prompt_tokens"], 200)

        self.assertEqual(data["total_tokens"], 300)

    def test_summary_with_errors(self):
        """Test summary with error logs."""
        config = self._create_config()
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            status="success",
        )
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=200,
            completion_tokens=100,
            total_tokens=300,
            status="error",
        )

        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=300,
            completion_tokens=150,
            total_tokens=450,
            status="error",
        )

        response = self.client.get("/api/usage/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_calls"], 3)
        self.assertEqual(data["error_count"], 2)


class UsageByModelTests(UsageTestBase):
    """Tests for GET /api/usage/by-model endpoint."""

    def test_by_model_empty(self):
        """Test by-model with no usage data."""
        response = self.client.get("/api/usage/by-model")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_by_model_with_data(self):
        """Test by-model with usage data."""
        config = self._create_config()
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            duration_ms=500,
        )
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=200,
            completion_tokens=100,
            total_tokens=300,
            duration_ms=1000,
        )
        # Create log with different config (different model)
        config2 = self._create_config(model_name="gpt-4o-mini")
        self._create_usage_log(
            config_id=config2.id,
            model_name="gpt-4o-mini",
            prompt_tokens=500,
            completion_tokens=250,
            total_tokens=750,
            duration_ms=2000,
        )

        response = self.client.get("/api/usage/by-model")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)

        gpt4o_data = next((d for d in data if d["model_name"] == "gpt-4o"), None)
        gpt4o_mini_data = next((d for d in data if d["model_name"] == "gpt-4o-mini"), None)

        self.assertIsNotNone(gpt4o_data)
        self.assertEqual(gpt4o_data["call_count"], 2)
        self.assertEqual(gpt4o_data["total_tokens"], 450)
        self.assertEqual(gpt4o_data["avg_duration_ms"], 750.0)

        self.assertIsNotNone(gpt4o_mini_data)
        self.assertEqual(gpt4o_mini_data["call_count"], 1)
        self.assertEqual(gpt4o_mini_data["total_tokens"], 750)


class UsageByAgentTests(UsageTestBase):
    """Tests for GET /api/usage/by-agent endpoint."""

    def test_by_agent_empty(self):
        """Test by-agent with no usage data."""
        response = self.client.get("/api/usage/by-agent")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_by_agent_with_data(self):
        """Test by-agent with usage data."""
        config = self._create_config()

        self._create_usage_log(
            config_id=config.id,
            agent_type="paper",
            prompt_tokens=100,
            total_tokens=150,
            duration_ms=500,
        )
        self._create_usage_log(
            config_id=config.id,
            agent_type="paper",
            prompt_tokens=200,
            total_tokens=300,
            duration_ms=1000,
        )
        self._create_usage_log(
            config_id=config.id,
            agent_type="global",
            prompt_tokens=500,
            total_tokens=700,
            duration_ms=2000,
        )
        # Test null agent_type becomes "unknown"
        self._create_usage_log(
            config_id=config.id,
            agent_type=None,
            prompt_tokens=50,
            total_tokens=80,
            duration_ms=200,
        )

        response = self.client.get("/api/usage/by-agent")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 3)

        paper = next((a for a in data if a["agent_type"] == "paper"), None)
        global_agent = next((a for a in data if a["agent_type"] == "global"), None)
        unknown = next((a for a in data if a["agent_type"] == "unknown"), None)

        self.assertIsNotNone(paper)
        self.assertEqual(paper["call_count"], 2)
        self.assertEqual(paper["total_tokens"], 450)
        self.assertAlmostEqual(paper["avg_duration_ms"], 750.0)

        self.assertIsNotNone(global_agent)
        self.assertEqual(global_agent["call_count"], 1)
        self.assertEqual(global_agent["total_tokens"], 700)
        self.assertEqual(global_agent["avg_duration_ms"], 2000.0)

        self.assertIsNotNone(unknown)
        self.assertEqual(unknown["call_count"], 1)


class UsageTimelineTests(UsageTestBase):
    """Tests for GET /api/usage/timeline endpoint."""

    def test_timeline_daily(self):
        """Test timeline with daily interval."""
        config = self._create_config()

        # Create logs on different days
        today = datetime.now(UTC)
        yesterday = today - timedelta(days=1)

        self._create_usage_log(
            config_id=config.id,
            total_tokens=100,
            created_at=today,
        )
        self._create_usage_log(
            config_id=config.id,
            total_tokens=150,
            created_at=today,
        )
        self._create_usage_log(
            config_id=config.id,
            total_tokens=200,
            created_at=yesterday,
        )

        response = self.client.get("/api/usage/timeline?interval=day")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(len(data), 2)
        # Verify data structure
        for point in data:
            self.assertIn("date", point)
            self.assertIn("calls", point)
            self.assertIn("tokens", point)
            self.assertRegex(point["date"], r"^\d{4}-\d{2}-\d{2}$")

    def test_timeline_hourly(self):
        """Test timeline with hourly interval."""
        config = self._create_config()

        now = datetime.now(UTC)
        self._create_usage_log(
            config_id=config.id,
            total_tokens=100,
            created_at=now,
        )
        response = self.client.get("/api/usage/timeline?interval=hour")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(len(data), 1)
        # Verify hourly format
        for point in data:
            self.assertRegex(point["date"], r"^\d{4}-\d{2}-\d{2} \d{2}:00$")

    def test_timeline_with_days_filter(self):
        """Test timeline respects days filter."""
        config = self._create_config()

        # Create old log
        self._create_usage_log(
            config_id=config.id,
            total_tokens=100,
            created_at=datetime.now(UTC) - timedelta(days=60),
        )
        response = self.client.get("/api/usage/timeline?days=30")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Old log should not be included
        total_tokens = sum(p["tokens"] for p in data)
        self.assertEqual(total_tokens, 0)

    def test_local_only_aggregates_exclude_remote_history(self):
        local_config = self._create_config(
            provider="openai_compatible",
            model_name="local-custom",
            display_name="Local Custom",
            is_local=True,
        )
        remote_config = self._create_config()
        self._create_usage_log(
            config_id=local_config.id,
            provider="openai_compatible",
            model_name="local-custom",
            prompt_tokens=80,
            completion_tokens=20,
            total_tokens=100,
        )
        self._create_usage_log(
            config_id=remote_config.id,
            total_tokens=900,
        )

        summary = self.client.get("/api/usage/summary?local_only=true")
        by_model = self.client.get("/api/usage/by-model?local_only=true")
        timeline = self.client.get("/api/usage/timeline?local_only=true")

        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.json()["total_calls"], 1)
        self.assertEqual(summary.json()["total_tokens"], 100)
        self.assertEqual(by_model.status_code, 200)
        self.assertEqual(
            [item["model_name"] for item in by_model.json()],
            ["local-custom"],
        )
        self.assertEqual(timeline.status_code, 200)
        self.assertEqual(sum(point["calls"] for point in timeline.json()), 1)
        self.assertEqual(sum(point["tokens"] for point in timeline.json()), 100)


class UsageRecentTests(UsageTestBase):
    """Tests for GET /api/usage/recent endpoint."""

    def test_recent_with_limit(self):
        """Test recent usage with limit parameter."""
        config = self._create_config()

        # Create multiple logs
        for i in range(10):
            self._create_usage_log(
                config_id=config.id,
                prompt_tokens=i * 10,
                total_tokens=i * 15,
            )

        response = self.client.get("/api/usage/recent?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 5)
        # Verify ordering (most recent first)
        self.assertGreater(data[0]["prompt_tokens"], data[4]["prompt_tokens"])

    def test_recent_default_limit(self):
        """Test recent usage with default limit."""
        config = self._create_config()

        # Create 30 logs
        for _i in range(30):
            self._create_usage_log(config_id=config.id)

        response = self.client.get("/api/usage/recent")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 30)

    def test_recent_max_limit(self):
        """Test recent usage respects max limit of 200."""
        config = self._create_config()

        # Create 250 logs
        for _i in range(250):
            self._create_usage_log(config_id=config.id)

        response = self.client.get("/api/usage/recent?limit=200")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 200)


class UsageAuditTests(UsageTestBase):
    """Tests for GET /api/usage/audit endpoint."""

    def test_audit_pagination(self):
        """Test audit log pagination."""
        config = self._create_config()

        # Create 25 logs
        for _i in range(25):
            self._create_usage_log(config_id=config.id)

        response = self.client.get("/api/usage/audit?page=1&size=10")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 10)
        self.assertEqual(data["meta"]["total"], 25)
        self.assertEqual(data["meta"]["page"], 1)
        self.assertEqual(data["meta"]["size"], 10)

        # Test page 2
        response2 = self.client.get("/api/usage/audit?page=2&size=10")
        self.assertEqual(response2.status_code, 200)
        data2 = response2.json()
        self.assertEqual(len(data2["items"]), 10)
        self.assertEqual(data2["meta"]["page"], 2)

        # Verify different items on different pages
        page1_ids = set(item["id"] for item in data["items"])
        page2_ids = set(item["id"] for item in data2["items"])
        self.assertEqual(len(page1_ids & page2_ids), 0)

    def test_audit_filter_by_config(self):
        """Test audit log filtered by config_id."""
        config1 = self._create_config()
        config2 = self._create_config(model_name="gpt-4o-mini")

        self._create_usage_log(config_id=config1.id)
        self._create_usage_log(config_id=config1.id)
        self._create_usage_log(config_id=config2.id)

        response = self.client.get(f"/api/usage/audit?config_id={config1.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 2)

    def test_audit_filter_by_agent_type(self):
        """Test audit log filtered by agent_type."""
        config = self._create_config()

        self._create_usage_log(config_id=config.id, agent_type="paper")
        self._create_usage_log(config_id=config.id, agent_type="paper")
        self._create_usage_log(config_id=config.id, agent_type="global")

        self._create_usage_log(config_id=config.id, agent_type="assistant")

        response = self.client.get("/api/usage/audit?agent_type=paper")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 2)

    def test_audit_filter_by_status(self):
        """Test audit log filtered by status."""
        config = self._create_config()

        self._create_usage_log(config_id=config.id, status="success")
        self._create_usage_log(config_id=config.id, status="success")
        self._create_usage_log(config_id=config.id, status="error")
        self._create_usage_log(config_id=config.id, status="timeout")

        response = self.client.get("/api/usage/audit?status=success")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 2)

    def test_audit_combined_filters(self):
        """Test audit log with combined filters."""
        config1 = self._create_config()
        config2 = self._create_config(model_name="gpt-4o-mini")

        self._create_usage_log(config_id=config1.id, agent_type="paper", status="success")
        self._create_usage_log(config_id=config1.id, agent_type="paper", status="error")
        self._create_usage_log(config_id=config1.id, agent_type="global", status="success")
        self._create_usage_log(config_id=config2.id, agent_type="paper", status="success")

        response = self.client.get(
            f"/api/usage/audit?config_id={config1.id}&agent_type=paper&status=success"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)

    def test_audit_ordering(self):
        """Test audit log is ordered by created_at descending."""
        config = self._create_config()

        # Create logs with explicit timestamps
        now = datetime.now(UTC)
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=100,
            created_at=now - timedelta(hours=2),
        )
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=200,
            created_at=now - timedelta(hours=1),
        )
        self._create_usage_log(
            config_id=config.id,
            prompt_tokens=300,
            created_at=now,
        )

        response = self.client.get("/api/usage/audit")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Most recent first
        self.assertEqual(data["items"][0]["prompt_tokens"], 300)
        self.assertEqual(data["items"][1]["prompt_tokens"], 200)
        self.assertEqual(data["items"][2]["prompt_tokens"], 100)


class UsageCostTests(UsageTestBase):
    """Tests for GET /api/usage/cost endpoint."""

    def test_cost_summary_with_data(self):
        """Test cost summary with usage data."""
        config = self._create_config()

        # Create logs for a model with known pricing (gpt-4o)
        self._create_usage_log(
            config_id=config.id,
            provider="openai",
            model_name="gpt-4o",
            prompt_tokens=1000000,  # 1M tokens
            completion_tokens=500000,  # 0.5M tokens
            total_tokens=1500000,
        )

        response = self.client.get("/api/usage/cost")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["period_days"], 30)
        self.assertIn("total_estimated_cost_usd", data)
        self.assertIn("breakdown", data)
        self.assertEqual(len(data["breakdown"]), 1)

        # Verify cost calculation: (1M * $2.50 + 0.5M * $10.00) / 1M = $2.50 + $5.00 = $7.50
        breakdown = data["breakdown"][0]
        self.assertEqual(breakdown["provider"], "openai")
        self.assertEqual(breakdown["model_name"], "gpt-4o")
        self.assertEqual(breakdown["prompt_tokens"], 1000000)
        self.assertEqual(breakdown["completion_tokens"], 500000)
        self.assertEqual(breakdown["estimated_cost_usd"], 7.5)

    def test_cost_summary_with_unknown_model(self):
        """Test cost summary with unknown model (no pricing)."""
        config = self._create_config()

        self._create_usage_log(
            config_id=config.id,
            provider="unknown_provider",
            model_name="unknown-model",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
        )

        response = self.client.get("/api/usage/cost")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_estimated_cost_usd"], 0.0)
        self.assertEqual(len(data["breakdown"]), 1)
        self.assertIsNone(data["breakdown"][0]["estimated_cost_usd"])

    def test_cost_summary_with_config_filter(self):
        """Test cost summary filtered by config_id."""
        config1 = self._create_config()
        config2 = self._create_config(model_name="gpt-4o-mini")

        self._create_usage_log(
            config_id=config1.id,
            provider="openai",
            model_name="gpt-4o",
            prompt_tokens=1000000,
            completion_tokens=0,
            total_tokens=1000000,
        )
        self._create_usage_log(
            config_id=config2.id,
            provider="openai",
            model_name="gpt-4o-mini",
            prompt_tokens=1000000,
            completion_tokens=0,
            total_tokens=1000000,
        )

        response = self.client.get(f"/api/usage/cost?config_id={config1.id}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["breakdown"]), 1)
        self.assertEqual(data["breakdown"][0]["model_name"], "gpt-4o")

    def test_cost_summary_multiple_models(self):
        """Test cost summary with multiple models."""
        config1 = self._create_config()
        config2 = self._create_config(model_name="gpt-4o-mini")

        self._create_usage_log(
            config_id=config1.id,
            provider="openai",
            model_name="gpt-4o",
            prompt_tokens=1000000,
            completion_tokens=0,
            total_tokens=1000000,
        )
        self._create_usage_log(
            config_id=config2.id,
            provider="openai",
            model_name="gpt-4o-mini",
            prompt_tokens=1000000,
            completion_tokens=0,
            total_tokens=1000000,
        )

        response = self.client.get("/api/usage/cost")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["breakdown"]), 2)
        # gpt-4o: 1M * $2.50 = $2.50
        # gpt-4o-mini: 1M * $0.15 = $0.15
        # Total: $2.65
        self.assertAlmostEqual(data["total_estimated_cost_usd"], 2.65, places=2)


if __name__ == "__main__":
    unittest.main()
