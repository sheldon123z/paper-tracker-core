function normalizeToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || /[\r\n]/u.test(token)) return null;
  return token;
}

export function isAllowedCorsOrigin(
  origin,
  allowedOrigins,
  { allowLocalhostDevelopment = false } = {},
) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (!allowLocalhostDevelopment) return false;

  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function extractToken(req) {
  const cookieToken = normalizeToken(req.cookies?.access_token);
  if (cookieToken) return cookieToken;

  const authHeader =
    req.headers?.authorization ?? req.headers?.Authorization ?? null;
  if (typeof authHeader !== "string") return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/iu);
  return match ? normalizeToken(match[1]) : null;
}

export function buildAgentAuthHeaders(req) {
  const cookieToken = normalizeToken(req.cookies?.access_token);
  if (cookieToken) {
    return {
      Authorization: `Bearer ${cookieToken}`,
      Cookie: `access_token=${cookieToken}`,
    };
  }

  const token = extractToken(req);
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}
