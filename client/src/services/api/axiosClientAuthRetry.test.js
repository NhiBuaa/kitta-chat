import assert from "node:assert/strict";
import test from "node:test";

import { createAxiosClient } from "./axiosClient.js";

const createTokenStore = ({ token = null } = {}) => {
  const calls = [];
  let currentToken = token;
  return {
    calls,
    getAccessToken: () => currentToken,
    setAccessToken: (nextToken) => {
      calls.push(["setAccessToken", nextToken]);
      currentToken = nextToken;
    },
    setStoredUser: (user) => calls.push(["setStoredUser", user]),
    clearAuthSession: () => {
      calls.push(["clearAuthSession"]);
      currentToken = null;
    },
  };
};

const createAxiosError = ({ status, config, url = config?.url || "/api/users/profile" }) => {
  const error = new Error(`Request failed with status ${status}`);
  error.isAxiosError = true;
  error.config = config;
  error.response = {
    status,
    config,
    data: { success: false },
    headers: {},
    statusText: String(status),
    request: {},
  };
  error.request = {};
  error.toJSON = () => ({ status, url });
  return error;
};

test("axiosClient attaches the current bearer token", async () => {
  const tokenStore = createTokenStore({ token: "access-token" });
  const client = createAxiosClient({
    tokenStore,
    adapter: async (config) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: { authorization: config.headers.Authorization },
    }),
  });

  const response = await client.get("/api/users/profile");

  assert.equal(response.data.authorization, "Bearer access-token");
});

test("axiosClient refreshes once on 401 and retries the original request with the new token", async () => {
  const tokenStore = createTokenStore({ token: "expired-token" });
  const events = [];
  const seenAuthorizations = [];
  let requestCount = 0;
  let refreshCount = 0;

  const client = createAxiosClient({
    tokenStore,
    eventTarget: { dispatchEvent: (event) => events.push(event.type) },
    refreshSession: async () => {
      refreshCount += 1;
      return { data: { success: true, token: "fresh-token", user: { id: "user-1" } } };
    },
    adapter: async (config) => {
      requestCount += 1;
      seenAuthorizations.push(config.headers.Authorization);
      if (requestCount === 1) {
        throw createAxiosError({ status: 401, config });
      }
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        data: { success: true },
      };
    },
  });

  const response = await client.get("/api/users/profile");

  assert.equal(response.status, 200);
  assert.equal(refreshCount, 1);
  assert.equal(requestCount, 2);
  assert.deepEqual(seenAuthorizations, ["Bearer expired-token", "Bearer fresh-token"]);
  assert.deepEqual(tokenStore.calls, [
    ["setAccessToken", "fresh-token"],
    ["setStoredUser", { id: "user-1" }],
  ]);
  assert.deepEqual(events, ["auth-changed"]);
});

test("axiosClient clears auth and redirects when refresh fails", async () => {
  const tokenStore = createTokenStore({ token: "expired-token" });
  const events = [];
  const location = { pathname: "/", href: "/" };

  const client = createAxiosClient({
    tokenStore,
    eventTarget: { dispatchEvent: (event) => events.push(event.type) },
    location,
    refreshSession: async () => {
      throw createAxiosError({ status: 401, config: { url: "/refresh" } });
    },
    adapter: async (config) => {
      throw createAxiosError({ status: 401, config });
    },
  });

  await assert.rejects(() => client.get("/api/users/profile"), /Request failed with status 401/);

  assert.deepEqual(tokenStore.calls, [["clearAuthSession"]]);
  assert.deepEqual(events, ["auth-changed"]);
  assert.equal(location.href, "/login");
});

test("axiosClient does not refresh an already retried request", async () => {
  const tokenStore = createTokenStore({ token: "expired-token" });
  let refreshCount = 0;

  const client = createAxiosClient({
    tokenStore,
    refreshSession: async () => {
      refreshCount += 1;
      return { data: { success: true, token: "fresh-token" } };
    },
    adapter: async (config) => {
      throw createAxiosError({ status: 401, config });
    },
  });

  await assert.rejects(
    () => client.get("/api/users/profile", { _authRetry: true }),
    /Request failed with status 401/,
  );

  assert.equal(refreshCount, 0);
});

test("axiosClient does not refresh the refresh endpoint recursively", async () => {
  const tokenStore = createTokenStore({ token: "expired-token" });
  let refreshCount = 0;

  const client = createAxiosClient({
    tokenStore,
    refreshSession: async () => {
      refreshCount += 1;
      return { data: { success: true, token: "fresh-token" } };
    },
    adapter: async (config) => {
      throw createAxiosError({ status: 401, config });
    },
  });

  await assert.rejects(
    () => client.post("/api/auth/refresh", null),
    /Request failed with status 401/,
  );

  assert.equal(refreshCount, 0);
});
