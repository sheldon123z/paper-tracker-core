/**
 * CopilotRuntime proxy server.
 *
 * Bridges CopilotKit React components to the FastAPI AG-UI endpoints.
 * Registers HttpAgent instances pointing to different backend endpoints.
 *
 * Security:
 * - CORS restricted to explicit origin whitelist (env: COPILOT_ALLOWED_ORIGINS)
 * - Optional shared-secret auth on proxy routes (env: COPILOT_RUNTIME_SECRET)
 * - Request timeout (30s) to prevent hung connections
 * - Connection limit (max 100 concurrent) to prevent resource exhaustion
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNodeExpressEndpoint,
} from "@copilotkit/runtime";
import { HttpAgent } from "@ag-ui/client";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5002";
const REQUEST_TIMEOUT_MS = 30_000;  // 30 seconds
const MAX_CONNECTIONS = 100;

// ---------------------------------------------------------------------------
// CORS origin whitelist
// COPILOT_ALLOWED_ORIGINS: comma-separated list of allowed origins.
// Defaults to dev origins if not set.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.COPILOT_ALLOWED_ORIGINS ||
  "http://localhost:3457,http://localhost:5002")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (curl, server-to-server) that have no Origin header
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    // In development (no COPILOT_RUNTIME_SECRET set), also allow any localhost origin
    if (!process.env.COPILOT_RUNTIME_SECRET) {
      try {
        const url = new URL(origin);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          return callback(null, true);
        }
      } catch {
        // invalid origin — fall through to deny
      }
    }

    callback(new Error("CORS origin not allowed: " + origin));
  },
  credentials: true,
};

// ---------------------------------------------------------------------------
// Shared-secret authentication middleware
// COPILOT_RUNTIME_SECRET: if set, all /copilotkit requests must include
//   X-Copilot-Secret header with matching value.
// If not set, auth is skipped (convenient for local development).
// ---------------------------------------------------------------------------
const RUNTIME_SECRET = process.env.COPILOT_RUNTIME_SECRET || null;

function secretAuth(req, res, next) {
  if (!RUNTIME_SECRET) return next();

  const provided = req.headers["x-copilot-secret"];
  if (provided === RUNTIME_SECRET) return next();

  res.status(401).json({ error: "Missing or invalid X-Copilot-Secret header" });
}

// ---------------------------------------------------------------------------
// Agent & runtime setup
// ---------------------------------------------------------------------------
const serviceAdapter = new ExperimentalEmptyAdapter();

const agents = {
  paperAgent: new HttpAgent({
    url: `${BACKEND_URL}/api/agui/paper`,
  }),
  globalAgent: new HttpAgent({
    url: `${BACKEND_URL}/api/agui/global`,
  }),
  assistantAgent: new HttpAgent({
    url: `${BACKEND_URL}/api/agui/assistant`,
  }),
  // 多智能体科研工作流: supervisor + search_agent + analysis_agent
  workflowAgent: new HttpAgent({
    url: `${BACKEND_URL}/api/agui/workflow`,
  }),
};

const runtime = new CopilotRuntime({
  agents,
});

const app = express();

app.use(cors(corsOptions));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// JWT forwarding middleware (Issue #117)
//
// Why this is needed:
//   HttpAgent is a server-side Node HTTP client that lives inside this Express
//   process — it has no awareness of the browser's httpOnly `access_token`
//   cookie. When CopilotKit (in the browser) POSTs to this proxy, the browser
//   includes the cookie on the request to :4100, but HttpAgent's outbound
//   request to the backend (:5002) starts with a fresh header set and does NOT
//   automatically relay that cookie. As a result, every AG-UI call hit the
//   backend without auth and `get_current_user` returned 401 for all users.
//
// What this middleware does:
//   Before each CopilotKit request is handed to the runtime, we read the JWT
//   from `req.cookies.access_token` (or fall back to the incoming Authorization
//   header), then inject it into every registered HttpAgent's `headers` map as
//   BOTH a Bearer token and a Cookie. The backend supports either path, so
//   sending both keeps us robust against future auth refactors.
//   After the response finishes (or the client disconnects) we clear the
//   injected headers so they don't leak into the next request.
//
// Concurrency caveat:
//   The HttpAgent instances are module-level singletons shared by all
//   requests. Mutating their headers per-request is SAFE for the current
//   single-user dev deployment, but for a multi-user production deployment
//   this must be refactored to construct request-scoped agents (e.g. build
//   the `agents` map inside the middleware and pass a fresh CopilotRuntime
//   per request). Two concurrent users would otherwise race on the shared
//   header object and potentially see each other's tokens.
// ---------------------------------------------------------------------------
const AGENT_LIST = Object.values(agents);

function extractToken(req) {
  const cookieToken = req.cookies && req.cookies.access_token;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return null;
}

function setAgentAuth(agent, token) {
  if (!agent.headers || typeof agent.headers !== "object") {
    agent.headers = {};
  }
  agent.headers["Authorization"] = `Bearer ${token}`;
  agent.headers["Cookie"] = `access_token=${token}`;
}

function clearAgentAuth(agent) {
  if (!agent.headers) return;
  delete agent.headers["Authorization"];
  delete agent.headers["Cookie"];
}

app.use((req, res, next) => {
  const token = extractToken(req);

  if (token) {
    for (const agent of AGENT_LIST) {
      setAgentAuth(agent, token);
    }

    let cleared = false;
    const clear = () => {
      if (cleared) return;
      cleared = true;
      for (const agent of AGENT_LIST) {
        clearAgentAuth(agent);
      }
    };
    res.on("finish", clear);
    res.on("close", clear);
  }
  // If no token, fall through — backend will return 401 on protected endpoints,
  // which is the correct behaviour for unauthenticated AG-UI calls.
  next();
});

// ---------------------------------------------------------------------------
// Request timeout middleware (Issue #42)
// Prevents hung connections from consuming server resources.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

// ---------------------------------------------------------------------------
// Active connection tracking with limit (Issue #42)
// Rejects new requests when too many connections are active.
// Uses cleanup guard to prevent double-decrement.
// ---------------------------------------------------------------------------
let activeConnections = 0;

app.use((req, res, next) => {
  if (activeConnections >= MAX_CONNECTIONS) {
    res.status(503).json({ error: "Too many connections. Please retry later." });
    return;
  }
  activeConnections++;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    activeConnections--;
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
});

// Health endpoint — no auth required
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "copilot-runtime", activeConnections });
});

// Proxy endpoint — auth-protected when secret is configured
//
// NOTE: CopilotKit SDK 1.54+ uses an internal Hono app with basePath routing.
// Express strips the mount prefix from req.url before passing it to the handler,
// so the Hono app never sees "/copilotkit" and fails to match its routes.
// Fix: mount at "/" and let Hono handle the full path matching itself.
app.use("/", secretAuth, copilotRuntimeNodeExpressEndpoint({
  runtime,
  serviceAdapter,
  endpoint: "/copilotkit",
}));

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`CopilotRuntime proxy running on port ${PORT}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  if (RUNTIME_SECRET) {
    console.log("Auth: X-Copilot-Secret header required");
  } else {
    console.log("Auth: disabled (no COPILOT_RUNTIME_SECRET set)");
  }
});
