import { Hono } from "hono";
import type { Env } from "../index";

const stats = new Hono<{ Bindings: Env }>();

/**
 * GET /api/stats/overview
 * Dashboard stats: paper count, feed count, tag count, recent papers, sync status.
 */
stats.get("/overview", async (c) => {
  const db = c.env.DB;

  // Run all count queries in parallel via D1 batch
  const [papersCount, feedsCount, tagsCount, recentPapers, syncMeta] = await db.batch([
    db.prepare("SELECT COUNT(*) as count FROM papers"),
    db.prepare("SELECT COUNT(*) as count FROM feeds"),
    db.prepare("SELECT COUNT(*) as count FROM tags"),
    db.prepare(
      "SELECT id, title, authors, source, relevance, created_at FROM papers ORDER BY created_at DESC LIMIT 10"
    ),
    db.prepare("SELECT * FROM _sync_meta ORDER BY last_sync_at DESC"),
  ]);

  const paperCount = (papersCount.results[0] as Record<string, unknown>)?.count ?? 0;
  const feedCount = (feedsCount.results[0] as Record<string, unknown>)?.count ?? 0;
  const tagCount = (tagsCount.results[0] as Record<string, unknown>)?.count ?? 0;

  return c.json({
    paper_count: paperCount,
    feed_count: feedCount,
    tag_count: tagCount,
    recent_papers: recentPapers.results,
    sync_status: syncMeta.results,
  });
});

export default stats;
