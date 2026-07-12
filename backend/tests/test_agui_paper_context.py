import unittest
from types import SimpleNamespace

from app.routes.agui import _build_paper_context


class PaperContextTests(unittest.TestCase):
    def test_build_paper_context_is_reusable_by_assistant_agent(self):
        paper = SimpleNamespace(
            id=61,
            title="MARL Paper",
            authors="Hua Li",
            category="ML Systems",
            published_date=None,
            link="https://example.test/paper",
            abstract="A paper abstract.",
            notes="Important note.",
            tags="MARL",
        )

        context = _build_paper_context(None, paper, {})

        self.assertIn("当前论文: [ID:61] MARL Paper", context)
        self.assertIn("作者: Hua Li", context)
        self.assertIn("## 摘要\nA paper abstract.", context)
        self.assertIn("## 用户笔记\nImportant note.", context)


if __name__ == "__main__":
    unittest.main()
