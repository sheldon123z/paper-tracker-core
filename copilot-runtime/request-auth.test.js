import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentAuthHeaders,
  extractToken,
  isAllowedCorsOrigin,
} from "./request-auth.js";

test("production CORS accepts only configured origins", () => {
  const allowedOrigins = ["http://127.0.0.1:8080", "http://localhost:8080"];

  assert.equal(
    isAllowedCorsOrigin("http://localhost:8080", allowedOrigins),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin("http://localhost:9999", allowedOrigins),
    false,
  );
  assert.equal(isAllowedCorsOrigin(undefined, allowedOrigins), true);
});

test("development fallback rejects localhost lookalikes", () => {
  const options = { allowLocalhostDevelopment: true };

  assert.equal(
    isAllowedCorsOrigin("http://127.0.0.1:3457", [], options),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin("http://localhost:3457", [], options),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin("http://localhost.example:3457", [], options),
    false,
  );
  assert.equal(
    isAllowedCorsOrigin("chrome-extension://localhost", [], options),
    false,
  );
});

test("cookie token takes precedence over Authorization", () => {
  const request = {
    cookies: { access_token: "cookie-token" },
    headers: { authorization: "Bearer header-token" },
  };

  assert.equal(extractToken(request), "cookie-token");
  assert.deepEqual(buildAgentAuthHeaders(request), {
    Authorization: "Bearer cookie-token",
    Cookie: "access_token=cookie-token",
  });
});

test("Bearer token is used when the cookie is absent", () => {
  const request = {
    cookies: {},
    headers: { authorization: "Bearer header-token" },
  };

  assert.equal(extractToken(request), "header-token");
  assert.deepEqual(buildAgentAuthHeaders(request), {
    Authorization: "Bearer header-token",
  });
});

test("missing or unsafe credentials are not forwarded", () => {
  assert.deepEqual(buildAgentAuthHeaders({ cookies: {}, headers: {} }), {});
  assert.deepEqual(
    buildAgentAuthHeaders({
      cookies: { access_token: "bad\r\ntoken" },
      headers: {},
    }),
    {},
  );
  assert.deepEqual(
    buildAgentAuthHeaders({
      cookies: {},
      headers: { authorization: "Basic credentials" },
    }),
    {},
  );
});

test("request header objects are independent", () => {
  const first = buildAgentAuthHeaders({
    cookies: { access_token: "first-token" },
    headers: {},
  });
  const second = buildAgentAuthHeaders({
    cookies: { access_token: "second-token" },
    headers: {},
  });

  first.Authorization = "mutated";
  assert.equal(second.Authorization, "Bearer second-token");
});
