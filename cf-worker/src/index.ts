import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import papers from "./routes/papers";
import feeds from "./routes/feeds";
import stats from "./routes/stats";
import sync from "./routes/sync";
import { proxyToBackend } from "./lib/proxy";

/**
 * Cloudflare Worker environment bindings.
 */
export interface Env {
  DB: D1Database;
  LOCAL_BACKEND_URL: string;
  SYNC_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: [
      "https://papers.sheldon123z.win",
      "http://localhost:3457",
      "http://localhost:5173",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: ["X-Proxy-Source", "X-Data-Source"],
    maxAge: 86400,
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "paper-tracker-api",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Route group 1: Sync routes -- handled directly by D1 (never proxied)
// ---------------------------------------------------------------------------

app.route("/api/sync", sync);

// ---------------------------------------------------------------------------
// Route group 2: Must-proxy routes -- always proxied to local backend
// These need capabilities that only exist on the local machine:
//   - /api/chat/*       -> LLM streaming (litellm)
//   - /api/llm-configs/*/test -> litellm test
//   - /api/feeds/*/run  -> RSS parser + scheduler
// ---------------------------------------------------------------------------

const MUST_PROXY_PATTERNS = [
  /^\/api\/chat(\/|$)/,
  /^\/api\/llm-configs\/\d+\/test$/,
  /^\/api\/feeds\/\d+\/run$/,
];

function isMustProxy(pathname: string): boolean {
  return MUST_PROXY_PATTERNS.some((pattern) => pattern.test(pathname));
}

app.all("/api/chat/*", async (c) => {
  try {
    return await proxyToBackend(c.req.raw, c.env.LOCAL_BACKEND_URL, {
      // Chat/streaming needs a longer timeout
      timeoutMs: 60000,
    });
  } catch (err) {
    return c.json(
      {
        error: "Local backend unavailable for chat. Chat requires the local backend to be running.",
        detail: err instanceof Error ? err.message : String(err),
      },
      503
    );
  }
});

app.post("/api/llm-configs/:id/test", async (c) => {
  try {
    return await proxyToBackend(c.req.raw, c.env.LOCAL_BACKEND_URL, {
      timeoutMs: 15000,
    });
  } catch (err) {
    return c.json(
      {
        error: "Local backend unavailable for LLM config testing.",
        detail: err instanceof Error ? err.message : String(err),
      },
      503
    );
  }
});

app.post("/api/feeds/:id/run", async (c) => {
  try {
    return await proxyToBackend(c.req.raw, c.env.LOCAL_BACKEND_URL, {
      timeoutMs: 30000,
    });
  } catch (err) {
    return c.json(
      {
        error: "Local backend unavailable for feed fetching.",
        detail: err instanceof Error ? err.message : String(err),
      },
      503
    );
  }
});

// ---------------------------------------------------------------------------
// Route group 3: D1-backed read routes (used as fallback)
// These are registered so that the try-proxy-then-D1 logic can fall through.
// ---------------------------------------------------------------------------

app.route("/api/papers", papers);
app.route("/api/feeds", feeds);
app.route("/api/stats", stats);

// ---------------------------------------------------------------------------
// Route group 4: Catch-all for other /api/* routes
// Strategy: try proxy to local backend (3s timeout), on failure return 503
// These are write-heavy routes (POST/PUT/DELETE on papers, feeds, tags, etc.)
// that we don't handle in D1 directly.
// ---------------------------------------------------------------------------

app.all("/api/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;

  // Skip must-proxy routes (already handled above)
  if (isMustProxy(pathname)) {
    // Shouldn't reach here due to explicit routes above, but just in case
    return c.json({ error: "Route should have been handled by explicit proxy handler" }, 500);
  }

  try {
    const response = await proxyToBackend(c.req.raw, c.env.LOCAL_BACKEND_URL, {
      timeoutMs: 3000,
    });
    return response;
  } catch {
    // For GET requests, try to serve from D1 if we have a matching route
    // The D1 routes are already registered above and would have matched first
    // if they existed. So if we're here, there's no D1 fallback for this path.
    return c.json(
      {
        error: "Local backend unavailable and no cached data available for this endpoint.",
        hint: "The local backend must be running for write operations and endpoints without D1 fallback.",
        path: pathname,
      },
      503
    );
  }
});

// ---------------------------------------------------------------------------
// 404 for non-API routes
// ---------------------------------------------------------------------------

app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      path: new URL(c.req.url).pathname,
    },
    404
  );
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.url}:`, err.message);
  return c.json(
    {
      error: "Internal server error",
      detail: err.message,
    },
    500
  );
});

export default app;
