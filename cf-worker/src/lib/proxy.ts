/**
 * Proxy module: forwards requests to the local backend with a configurable timeout.
 * On timeout or network error, throws so callers can fall back to D1.
 */

const DEFAULT_TIMEOUT_MS = 3000;

export interface ProxyOptions {
  /** Timeout in milliseconds. Defaults to 3000. */
  timeoutMs?: number;
  /** Override the backend base URL. */
  backendUrl?: string;
}

/**
 * Proxies an incoming request to the local backend.
 *
 * - Preserves method, headers, and body.
 * - Strips the host header so the backend receives its own host.
 * - Applies an AbortController timeout (default 3 s).
 * - Returns the backend Response on success.
 * - Throws on timeout or fetch error.
 */
export async function proxyToBackend(
  request: Request,
  localBackendUrl: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backendBase = (options.backendUrl ?? localBackendUrl).replace(/\/+$/, "");

  // Build target URL: keep the pathname + query from the original request
  const url = new URL(request.url);
  const targetUrl = `${backendBase}${url.pathname}${url.search}`;

  // Clone headers but remove host so backend sees its own host
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("cf-ipcountry");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
      signal: controller.signal,
    };

    // Only attach body for methods that support it
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      // @ts-expect-error - duplex is needed for streaming request bodies in Workers
      init.duplex = "half";
    }

    const response = await fetch(targetUrl, init);

    // Return a new Response so we can modify headers if needed
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("X-Proxy-Source", "cf-worker");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
