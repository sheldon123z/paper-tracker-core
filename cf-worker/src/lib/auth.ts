import type { Context, Next } from "hono";
import type { Env } from "../index";

/**
 * Middleware that validates Bearer token against SYNC_SECRET environment variable.
 * Used to protect sync routes from unauthorized access.
 */
export async function syncAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const syncSecret = c.env.SYNC_SECRET;
  if (!syncSecret) {
    return c.json({ error: "SYNC_SECRET not configured on worker" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return c.json({ error: "Missing Authorization header" }, 401);
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return c.json({ error: "Invalid Authorization header format. Expected: Bearer <token>" }, 401);
  }

  const token = parts[1];
  if (token !== syncSecret) {
    return c.json({ error: "Invalid sync token" }, 403);
  }

  await next();
}
