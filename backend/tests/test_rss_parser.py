"""Tests for backend.app.services.rss_parser.

Focus on the opportunistic backfill behavior introduced for the
rss-fetch v2 阻塞 bug：当 ingest_feeds() 三层去重命中已有 paper 时，
若该 paper 的 source_feed_id 仍为 None，应顺手回填 feed.id。
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.database import Base
from backend.app.models import Feed, Paper
from backend.app.services import rss_parser
from backend.tests.support import make_test_session_factory


class TestIngestFeedsBackfill(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.SessionLocal = make_test_session_factory()

    def setUp(self):
        self.db = self.SessionLocal()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _create_feed(self, **kwargs) -> Feed:
        defaults = {
            "name": "Backfill Test Feed",
            "url": "https://example.com/backfill.xml",
            "source": "rss",
            "is_active": True,
            "fetch_interval": 120,
        }
        defaults.update(kwargs)
        feed = Feed(**defaults)
        self.db.add(feed)
        self.db.commit()
        self.db.refresh(feed)
        return feed

    def _create_paper(self, **kwargs) -> Paper:
        defaults = {
            "title": "Existing Paper",
            "authors": "Some Author",
            "abstract": "old abstract",
            "source": "rss",
        }
        defaults.update(kwargs)
        paper = Paper(**defaults)
        self.db.add(paper)
        self.db.commit()
        self.db.refresh(paper)
        return paper

    def test_ingest_backfills_source_feed_id_for_existing_paper(self):
        """已有 paper（source_feed_id=None）命中 link 去重时应被回填 feed.id。"""
        feed = self._create_feed()
        link = "https://example.com/papers/abc-123"
        paper = self._create_paper(
            title="Existing Paper",
            link=link,
            content_hash=rss_parser._compute_content_hash("Existing Paper"),
            source_feed_id=None,
        )

        # 让 fetch_feed_entries 返回一个与 existing paper 相同 link 的 entry
        with patch.object(
            rss_parser,
            "fetch_feed_entries",
            return_value=[
                {
                    "link": link,
                    "title": "Existing Paper",
                    "summary": "whatever",
                }
            ],
        ):
            stats = rss_parser.ingest_feeds(self.db, [feed])

        self.assertEqual(stats["skipped_duplicates"], 1)
        self.assertEqual(stats["new_papers"], 0)
        self.assertEqual(stats["backfilled_feed_id"], 1)

        self.db.refresh(paper)
        self.assertEqual(paper.source_feed_id, feed.id)

    def test_ingest_does_not_overwrite_existing_source_feed_id(self):
        """已经有 source_feed_id 的 paper 命中去重时不应被覆盖，也不计入 backfill 统计。"""
        feed_a = self._create_feed(name="Feed A", url="https://a.example.com/feed.xml")
        feed_b = self._create_feed(name="Feed B", url="https://b.example.com/feed.xml")
        link = "https://example.com/papers/owned-by-a"
        paper = self._create_paper(
            title="Owned By A",
            link=link,
            content_hash=rss_parser._compute_content_hash("Owned By A"),
            source_feed_id=feed_a.id,
        )

        # feed_b 抓到同一篇 paper，不应改写 ownership
        with patch.object(
            rss_parser,
            "fetch_feed_entries",
            return_value=[{"link": link, "title": "Owned By A"}],
        ):
            stats = rss_parser.ingest_feeds(self.db, [feed_b])

        self.assertEqual(stats["skipped_duplicates"], 1)
        self.assertEqual(stats["backfilled_feed_id"], 0)

        self.db.refresh(paper)
        self.assertEqual(paper.source_feed_id, feed_a.id)

    def test_ingest_backfills_via_arxiv_id_match(self):
        """当 link 不同但 arxiv_id 相同时，也应回填 source_feed_id。"""
        feed = self._create_feed()
        existing_link = "https://arxiv.org/abs/2301.12345"
        paper = self._create_paper(
            title="ArXiv Paper",
            link=existing_link,
            arxiv_id="2301.12345",
            content_hash=rss_parser._compute_content_hash("ArXiv Paper"),
            source_feed_id=None,
        )

        # 新 entry 的 link 是 pdf 形式 → 与现有不同，但 _extract_arxiv_id 仍匹配
        with patch.object(
            rss_parser,
            "fetch_feed_entries",
            return_value=[
                {
                    "link": "https://arxiv.org/pdf/2301.12345",
                    "title": "ArXiv Paper Different Title",
                }
            ],
        ):
            stats = rss_parser.ingest_feeds(self.db, [feed])

        self.assertEqual(stats["skipped_duplicates"], 1)
        self.assertEqual(stats["backfilled_feed_id"], 1)

        self.db.refresh(paper)
        self.assertEqual(paper.source_feed_id, feed.id)


if __name__ == "__main__":
    unittest.main()
