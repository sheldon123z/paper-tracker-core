import { Hono } from "hono";
import type { Env } from "../index";
import { syncAuth } from "../lib/auth";

const sync = new Hono<{ Bindings: Env }>();

// All sync routes require authentication
sync.use("/*", syncAuth);

/** Tables allowed for sync. Maps table name to its columns for INSERT OR REPLACE. */
const SYNC_TABLES: Record<string, string[]> = {
  papers: [
    "id", "title", "authors", "abstract", "link", "source",
    "published_date", "relevance", "category", "is_read", "is_favorited",
    "notes", "tags", "created_at", "arxiv_id", "doi", "pdf_url",
    "ai_summary", "content_hash",
  ],
  feeds: [
    "id", "name", "url", "source", "last_fetched", "is_active",
    "fetch_interval", "last_error",
  ],
  tags: ["id", "name", "color"],
  paper_tags: ["id", "paper_id", "tag_id", "created_at"],
  paper_tag_association: ["paper_id", "tag_id"],
  llm_configs: [
    "id", "provider", "display_name", "api_key_encrypted",
    "model_name", "base_url", "is_default", "created_at",
  ],
  prompt_templates: [
    "id", "name", "prompt_text", "icon", "sort_order", "is_builtin", "created_at",
  ],
  chat_messages: [
    "id", "paper_id", "session_id", "session_type", "role", "content", "created_at",
  ],
  global_chat_sessions: ["id", "session_id", "title", "created_at"],
};

interface SyncPushBody {
  table: string;
  records: Record<string, unknown>[];
  timestamp: string;
}

/**
 * POST /api/sync/push
 * Receives batch data from local backend, upserts into D1.
 *
 * Body: { table: string, records: array, timestamp: string }
 *
 * For llm_configs, api_key_encrypted is always stripped for security.
 */
sync.post("/push", async (c) => {
  const db = c.env.DB;
  let body: SyncPushBody;

  try {
    body = await c.req.json<SyncPushBody>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { table, records, timestamp } = body;

  if (!table || !records || !Array.isArray(records)) {
    return c.json({ error: "Missing required fields: table, records" }, 400);
  }

  const columns = SYNC_TABLES[table];
  if (!columns) {
    return c.json(
      { error: `Unknown table: ${table}. Allowed: ${Object.keys(SYNC_TABLES).join(", ")}` },
      400
    );
  }

  if (records.length === 0) {
    // Update sync meta even for empty push (signals "we checked, nothing to sync")
    await db
      .prepare(
        "INSERT OR REPLACE INTO _sync_meta (table_name, last_sync_at, record_count) VALUES (?, ?, 0)"
      )
      .bind(table, timestamp || new Date().toISOString())
      .run();

    return c.json({ ok: true, table, upserted: 0 });
  }

  // Build batch of INSERT OR REPLACE statements
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

  const statements = records.map((record) => {
    const values = columns.map((col) => {
      // Security: always clear api_key_encrypted in D1
      if (col === "api_key_encrypted") {
        return "";
      }
      const val = record[col];
      // Convert undefined/null to null
      return val === undefined ? null : val;
    });
    return db.prepare(sql).bind(...values);
  });

  // D1 batch has a limit; chunk if needed (D1 supports up to ~100 statements per batch)
  const BATCH_SIZE = 80;
  let totalUpserted = 0;

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    await db.batch(chunk);
    totalUpserted += chunk.length;
  }

  // Update sync metadata
  await db
    .prepare(
      "INSERT OR REPLACE INTO _sync_meta (table_name, last_sync_at, record_count) VALUES (?, ?, ?)"
    )
    .bind(table, timestamp || new Date().toISOString(), records.length)
    .run();

  return c.json({
    ok: true,
    table,
    upserted: totalUpserted,
    timestamp: timestamp || new Date().toISOString(),
  });
});

/**
 * GET /api/sync/status
 * Returns sync metadata for all tables.
 */
sync.get("/status", async (c) => {
  const db = c.env.DB;
  const result = await db.prepare("SELECT * FROM _sync_meta ORDER BY last_sync_at DESC").all();
  return c.json({ tables: result.results });
});

/**
 * POST /api/sync/full
 * Receives a full sync payload with multiple tables at once.
 *
 * Body: { tables: { [tableName]: records[] }, timestamp: string }
 */
sync.post("/full", async (c) => {
  const db = c.env.DB;
  let body: { tables: Record<string, Record<string, unknown>[]>; timestamp: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { tables: tableData, timestamp } = body;
  if (!tableData || typeof tableData !== "object") {
    return c.json({ error: "Missing required field: tables" }, 400);
  }

  const results: Record<string, number> = {};

  for (const [table, records] of Object.entries(tableData)) {
    const columns = SYNC_TABLES[table];
    if (!columns) {
      results[table] = -1; // indicate error
      continue;
    }

    if (!Array.isArray(records) || records.length === 0) {
      results[table] = 0;
      continue;
    }

    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

    const statements = records.map((record) => {
      const values = columns.map((col) => {
        if (col === "api_key_encrypted") return "";
        const val = record[col];
        return val === undefined ? null : val;
      });
      return db.prepare(sql).bind(...values);
    });

    const BATCH_SIZE = 80;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const chunk = statements.slice(i, i + BATCH_SIZE);
      await db.batch(chunk);
    }

    results[table] = records.length;

    // Update sync meta
    await db
      .prepare(
        "INSERT OR REPLACE INTO _sync_meta (table_name, last_sync_at, record_count) VALUES (?, ?, ?)"
      )
      .bind(table, timestamp || new Date().toISOString(), records.length)
      .run();
  }

  return c.json({
    ok: true,
    results,
    timestamp: timestamp || new Date().toISOString(),
  });
});

export default sync;
