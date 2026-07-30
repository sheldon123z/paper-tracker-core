/**
 * CopilotRuntime proxy server.
 *
 * Bridges CopilotKit React components to the FastAPI AG-UI endpoints.
 * Registers HttpAgent instances pointing to different backend endpoints.
 *
 * Security:
 * - CORS restricted to explicit origin whitelist (env: COPILOT_ALLOWED_ORIGINS)
 * - Optional shared-secret auth on proxy routes (env: COPILOT_RUNTIME_SECRET)
 * - Configurable request timeout for long-running research workflows
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
import {
  buildAgentAuthHeaders,
  isAllowedCorsOrigin,
} from "./request-auth.js";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5002";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const configuredRequestTimeoutMs = Number.parseInt(
  process.env.COPILOT_REQUEST_TIMEOUT_MS || "300000",
  10,
);
const REQUEST_TIMEOUT_MS = Number.isFinite(configuredRequestTimeoutMs)
  ? configuredRequestTimeoutMs
  : 300_000; // 5 minutes by default; workflow streams also emit keep-alive activities.
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
    const allowed = isAllowedCorsOrigin(origin, ALLOWED_ORIGINS, {
      allowLocalhostDevelopment:
        !IS_PRODUCTION && !process.env.COPILOT_RUNTIME_SECRET,
    });
    if (allowed) return callback(null, true);

    callback(new Error("CORS origin not allowed: " + origin));
  },
  credentials: true,
};

// ---------------------------------------------------------------------------
// Shared-secret authentication middleware
// COPILOT_RUNTIME_SECRET: if set, all Copilot runtime requests must include
//   X-Copilot-Secret header with matching value.
// If not set, auth is skipped (convenient for local development).
// ---------------------------------------------------------------------------
const RUNTIME_SECRET = process.env.COPILOT_RUNTIME_SECRET || null;
const configuredRuntimeEndpoint = process.env.COPILOT_RUNTIME_ENDPOINT || "/api/copilotkit";
const RUNTIME_ENDPOINT = configuredRuntimeEndpoint.startsWith("/")
  ? configuredRuntimeEndpoint
  : `/${configuredRuntimeEndpoint}`;

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

function createRequestAgents(headers) {
  return {
    paperAgent: new HttpAgent({
      url: `${BACKEND_URL}/api/agui/paper`,
      headers,
    }),
    globalAgent: new HttpAgent({
      url: `${BACKEND_URL}/api/agui/global`,
      headers,
    }),
    assistantAgent: new HttpAgent({
      url: `${BACKEND_URL}/api/agui/assistant`,
      headers,
    }),
    // 多智能体科研工作流: supervisor + search_agent + analysis_agent
    workflowAgent: new HttpAgent({
      url: `${BACKEND_URL}/api/agui/workflow`,
      headers,
    }),
  };
}

const app = express();

app.use(cors(corsOptions));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Request-scoped JWT forwarding (Issue #117)
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
// Each proxy request creates fresh HttpAgent and CopilotRuntime instances.
// The forwarded headers therefore live only for that request, so concurrent
// users cannot overwrite one another's credentials during streamed responses.
// ---------------------------------------------------------------------------

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
// so the Hono app never sees the runtime endpoint and fails to match its routes.
// Fix: mount at "/" and let Hono handle the full path matching itself.
app.use("/", secretAuth, (req, res, next) => {
  const runtime = new CopilotRuntime({
    agents: createRequestAgents(buildAgentAuthHeaders(req)),
  });
  const endpoint = copilotRuntimeNodeExpressEndpoint({
    runtime,
    serviceAdapter,
    endpoint: RUNTIME_ENDPOINT,
  });
  return endpoint(req, res, next);
});

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`CopilotRuntime proxy running on port ${PORT}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Endpoint: ${RUNTIME_ENDPOINT}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  if (RUNTIME_SECRET) {
    console.log("Auth: X-Copilot-Secret header required");
  } else {
    console.log("Auth: disabled (no COPILOT_RUNTIME_SECRET set)");
  }
});
