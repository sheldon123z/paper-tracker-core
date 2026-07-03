from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

import backend.tests  # noqa: F401
from backend.app.models import Paper
from backend.app.services.workflow_graph import WORKFLOW_INITIAL_STATE, create_workflow_graph
from backend.tests.support import make_test_session_factory
from langchain_core.messages import AIMessage, HumanMessage


class _FakeLLM:
    def __init__(self, replies: list[str]):
        self.replies = list(replies)

    async def ainvoke(self, _messages):
        content = self.replies.pop(0) if self.replies else "## 建议\n- 保持现状\n## 后续问题\n- 下一步做什么？"
        return AIMessage(content=content)


def _workflow_state(*, topic: str, template_id: str, template_params: dict | None = None, messages=None):
    return {
        **WORKFLOW_INITIAL_STATE,
        "messages": messages or [HumanMessage(content=topic)],
        "provider_key": "openai",
        "display_name": "OpenAI",
        "model_name": "gpt-4o-mini",
        "litellm_model": "openai/gpt-4o-mini",
        "api_key": "sk-test",
        "base_url": "https://api.openai.com/v1",
        "extra_headers": {},
        "model_kwargs": {},
        "api_format": "native",
        "is_local": False,
        "supports_streaming": True,
        "supports_tool_calling": True,
        "supports_reasoning": True,
        "supports_vision": True,
        "template_id": template_id,
        "template_params": template_params or {
            "topic": topic,
            "timeRange": "近5年",
            "sources": ["本地论文库"],
            "depth": "深度分析",
        },
        "research_topic": topic,
    }


class WorkflowGraphTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.session_factory = make_test_session_factory()

    @classmethod
    def tearDownClass(cls):
        cls.session_factory.kw["bind"].dispose()

    def setUp(self):
        self.db = self.session_factory()
        self.db.add_all(
            [
                Paper(
                    title="RAG Benchmarking for Enterprise Search",
                    authors="Alice, Bob",
                    abstract="This paper studies retrieval augmented generation systems with transformer baselines and enterprise benchmarks.",
                    source="rss",
                    published_date=datetime(2025, 5, 1),
                    relevance=3.5,
                    category="cs.CL",
                    ai_summary="Evaluates RAG pipelines and highlights benchmark trade-offs.",
                    doi="10.1000/rag-a",
                ),
                Paper(
                    title="Adaptive Retrieval for Long Context QA",
                    authors="Carol, Dave",
                    abstract="We present an adaptive retrieval strategy for long context question answering with LLM agents.",
                    source="rss",
                    published_date=datetime(2024, 10, 1),
                    relevance=3.2,
                    category="cs.AI",
                    ai_summary="Introduces adaptive retrieval and agent planning for QA tasks.",
                    doi="10.1000/rag-b",
                ),
                Paper(
                    title="Grounded Generation with Hybrid Indexing",
                    authors="Eve, Frank",
                    abstract="Hybrid dense-sparse indexing improves grounded generation quality and reduces hallucination.",
                    source="rss",
                    published_date=datetime(2023, 9, 1),
                    relevance=2.9,
                    category="cs.IR",
                    ai_summary="Shows hybrid indexing helps grounded generation.",
                    doi="10.1000/rag-c",
                ),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        cleanup = self.session_factory()
        try:
            for table in reversed(Paper.metadata.sorted_tables):
                cleanup.execute(table.delete())
            cleanup.commit()
        finally:
            cleanup.close()

    async def test_literature_survey_pipeline_populates_core_outputs(self):
        graph = create_workflow_graph(self.db)
        fake_llm = _FakeLLM(
            [
                "# RAG 文献综述\n\n## 研究脉络\n- 检索增强与 grounded generation 持续融合。\n\n## 建议\n- 继续补充最新 benchmark。\n\n## 后续问题\n- 是否需要加入企业场景评测？"
            ]
        )
        with patch("backend.app.services.workflow_graph.build_chat_llm", return_value=fake_llm):
            result = await graph.ainvoke(_workflow_state(topic="RAG 检索增强生成", template_id="literature_survey"))

        self.assertEqual(result["workflow_status"], "completed")
        self.assertGreaterEqual(len(result["search_results"]), 2)
        self.assertGreaterEqual(len(result["selected_papers"]), 2)
        self.assertGreaterEqual(len(result["paper_analyses"]), 2)
        self.assertTrue(result["trend_data"]["top_keywords"])
        self.assertIn("RAG 文献综述", result["final_report"])
        self.assertTrue(result["literature_draft"])
        self.assertIn("继续补充最新 benchmark。", result["recommendations"])
        self.assertIn("是否需要加入企业场景评测？", result["follow_up_questions"])

    async def test_specialized_templates_produce_template_specific_outputs(self):
        scenarios = [
            ("trend_radar", {"topic": "RAG 检索增强生成", "timeRange": "近5年", "sources": ["本地论文库"]}, "trend_data"),
            ("paper_comparison", {"topic": "RAG 检索增强生成", "timeRange": "近5年", "sources": ["本地论文库"], "paperCount": 2}, "comparison_pairs"),
            ("gap_finder", {"topic": "RAG 检索增强生成", "timeRange": "近5年", "sources": ["本地论文库"]}, "gap_report"),
            ("submission_prep", {"topic": "RAG 检索增强生成", "timeRange": "近5年", "sources": ["本地论文库"]}, "submission_plan"),
        ]
        for template_id, params, expected_field in scenarios:
            with self.subTest(template_id=template_id):
                graph = create_workflow_graph(self.db)
                fake_llm = _FakeLLM(
                    [f"# {template_id}\n\n## 建议\n- 针对 {template_id} 继续细化。\n\n## 后续问题\n- 是否需要扩展数据源？"]
                )
                with patch("backend.app.services.workflow_graph.build_chat_llm", return_value=fake_llm):
                    result = await graph.ainvoke(_workflow_state(topic="RAG 检索增强生成", template_id=template_id, template_params=params))
                self.assertEqual(result["workflow_status"], "completed")
                self.assertTrue(result.get(expected_field))
                self.assertIn(template_id, result["final_report"])

    async def test_completed_workflow_routes_follow_up_to_discussion_agent(self):
        graph = create_workflow_graph(self.db)
        fake_llm = _FakeLLM(["可以，我先展开趋势部分：当前重点仍在 retrieval 与 grounded generation 的结合。"])
        state = _workflow_state(
            topic="RAG 检索增强生成",
            template_id="trend_radar",
            messages=[
                HumanMessage(content="请帮我做 RAG 趋势分析"),
                AIMessage(content="# 趋势报告"),
                HumanMessage(content="请进一步展开趋势部分"),
            ],
        )
        state.update(
            {
                "workflow_status": "completed",
                "planned_stages": ["normalize", "search", "select", "trends", "synthesis"],
                "completed_stages": ["normalize", "search", "select", "trends", "synthesis"],
                "completed_agents": ["supervisor", "search", "trends", "writing"],
                "research_topic": "RAG 检索增强生成",
                "final_report": "# 趋势报告",
                "selected_papers": [{"title": "Adaptive Retrieval for Long Context QA"}],
            }
        )
        with patch("backend.app.services.workflow_graph.build_chat_llm", return_value=fake_llm):
            result = await graph.ainvoke(state)

        self.assertEqual(result["workflow_status"], "completed")
        self.assertEqual(result["messages"][-1].content, "可以，我先展开趋势部分：当前重点仍在 retrieval 与 grounded generation 的结合。")
        self.assertEqual(result["final_report"], "# 趋势报告")
