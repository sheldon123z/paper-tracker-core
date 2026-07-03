import { Hono } from "hono";
import type { Env } from "../index";

const papers = new Hono<{ Bindings: Env }>();

/**
 * GET /api/papers/stats
 * Paper counts and tag distribution from D1.
 * Note: this route must be registered BEFORE /api/papers/:id to avoid conflicts.
 */
papers.get("/stats", async (c) => {
  const db = c.env.DB;

  const totalResult = await db
    .prepare("SELECT COUNT(*) as count FROM papers")
    .first<{ count: number }>();

  const unreadResult = await db
    .prepare("SELECT COUNT(*) as count FROM papers WHERE is_read = 0")
    .first<{ count: number }>();

  const favoritedResult = await db
    .prepare("SELECT COUNT(*) as count FROM papers WHERE is_favorited = 1")
    .first<{ count: number }>();

  const avgResult = await db
    .prepare("SELECT AVG(relevance) as avg_relevance FROM papers")
    .first<{ avg_relevance: number | null }>();

  // Source distribution
  const sourceRows = await db
    .prepare("SELECT source, COUNT(*) as count FROM papers GROUP BY source")
    .all<{ source: string; count: number }>();
  const sourceDistribution: Record<string, number> = {};
  for (const row of sourceRows.results) {
    sourceDistribution[row.source] = row.count;
  }

  // Category distribution
  const categoryRows = await db
    .prepare("SELECT category, COUNT(*) as count FROM papers GROUP BY category")
    .all<{ category: string; count: number }>();
  const categoryDistribution: Record<string, number> = {};
  for (const row of categoryRows.results) {
    categoryDistribution[row.category] = row.count;
  }

  // Papers over time (last 30 days, grouped by date)
  const timeRows = await db
    .prepare(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM papers
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY DATE(created_at)
       ORDER BY date`
    )
    .all<{ date: string; count: number }>();
  const papersOverTime: Record<string, number> = {};
  for (const row of timeRows.results) {
    papersOverTime[row.date] = row.count;
  }

  return c.json({
    total_papers: totalResult?.count ?? 0,
    unread_papers: unreadResult?.count ?? 0,
    favorited_papers: favoritedResult?.count ?? 0,
    avg_relevance: avgResult?.avg_relevance ?? 0,
    source_distribution: sourceDistribution,
    category_distribution: categoryDistribution,
    papers_over_time: papersOverTime,
  });
});

/**
 * GET /api/papers
 * List papers from D1 with pagination, search, and tag filter.
 *
 * Query params:
 *   - page (default 1)
 *   - size (default 20)
 *   - search (optional, searches title and abstract)
 *   - tag (optional, filters by tag name via paper_tags join)
 *   - category (optional)
 *   - is_read (optional, "true" or "false")
 *   - is_favorited (optional, "true" or "false")
 *   - sort (optional, e.g. "relevance", "created_at", "published_date")
 *   - order (optional, "asc" or "desc", default "desc")
 */
papers.get("/", async (c) => {
  const db = c.env.DB;

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const size = Math.min(100, Math.max(1, parseInt(c.req.query("size") ?? "20", 10)));
  const search = c.req.query("search")?.trim();
  const tag = c.req.query("tag")?.trim();
  const category = c.req.query("category")?.trim();
  const isRead = c.req.query("is_read");
  const isFavorited = c.req.query("is_favorited");
  const sort = c.req.query("sort") ?? "created_at";
  const order = c.req.query("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * size;

  // Validate sort column to prevent SQL injection
  const allowedSorts = ["created_at", "published_date", "relevance", "title", "id"];
  const sortColumn = allowedSorts.includes(sort) ? sort : "created_at";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push("(p.title LIKE ? OR p.abstract LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category) {
    conditions.push("p.category = ?");
    params.push(category);
  }

  if (isRead === "true" || isRead === "false") {
    conditions.push("p.is_read = ?");
    params.push(isRead === "true" ? 1 : 0);
  }

  if (isFavorited === "true" || isFavorited === "false") {
    conditions.push("p.is_favorited = ?");
    params.push(isFavorited === "true" ? 1 : 0);
  }

  let joinClause = "";
  if (tag) {
    joinClause = `
      INNER JOIN paper_tags pt ON pt.paper_id = p.id
      INNER JOIN tags t ON t.id = pt.tag_id
    `;
    conditions.push("t.name = ?");
    params.push(tag);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total
  const countSql = `SELECT COUNT(DISTINCT p.id) as total FROM papers p ${joinClause} ${whereClause}`;
  const countResult = await db
    .prepare(countSql)
    .bind(...params)
    .first<{ total: number }>();

  // Fetch page
  const dataSql = `
    SELECT DISTINCT p.*
    FROM papers p
    ${joinClause}
    ${whereClause}
    ORDER BY p.${sortColumn} ${order}
    LIMIT ? OFFSET ?
  `;
  const dataResult = await db
    .prepare(dataSql)
    .bind(...params, size, offset)
    .all();

  // Map D1 integer booleans to real booleans for JSON response
  const items = dataResult.results.map((row: Record<string, unknown>) => ({
    ...row,
    is_read: Boolean(row.is_read),
    is_favorited: Boolean(row.is_favorited),
  }));

  return c.json({
    items,
    meta: {
      total: countResult?.total ?? 0,
      page,
      size,
    },
  });
});

/**
 * GET /api/papers/:id
 * Single paper from D1.
 */
papers.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Invalid paper ID" }, 400);
  }

  const paper = await db
    .prepare("SELECT * FROM papers WHERE id = ?")
    .bind(id)
    .first();

  if (!paper) {
    return c.json({ error: "Paper not found" }, 404);
  }

  return c.json({
    ...paper,
    is_read: Boolean(paper.is_read),
    is_favorited: Boolean(paper.is_favorited),
  });
});

export default papers;
