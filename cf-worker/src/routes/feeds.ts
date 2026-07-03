import { Hono } from "hono";
import type { Env } from "../index";

const feeds = new Hono<{ Bindings: Env }>();

/**
 * GET /api/feeds
 * List all feeds from D1.
 */
feeds.get("/", async (c) => {
  const db = c.env.DB;

  const result = await db
    .prepare("SELECT * FROM feeds ORDER BY id DESC")
    .all();

  const items = result.results.map((row: Record<string, unknown>) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));

  return c.json(items);
});

/**
 * GET /api/feeds/:id
 * Single feed from D1.
 */
feeds.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param("id"), 10);

  if (isNaN(id)) {
    return c.json({ error: "Invalid feed ID" }, 400);
  }

  const feed = await db
    .prepare("SELECT * FROM feeds WHERE id = ?")
    .bind(id)
    .first();

  if (!feed) {
    return c.json({ error: "Feed not found" }, 404);
  }

  return c.json({
    ...feed,
    is_active: Boolean(feed.is_active),
  });
});

export default feeds;
