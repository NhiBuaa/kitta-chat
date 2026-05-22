import assert from "node:assert/strict";
import test from "node:test";

import { bootstrapAuth, logoutAuth } from "./authBootstrap.js";

const createTokenStore = ({ token = null, user = null } = {}) => {
  const calls = [];
  let currentToken = token;
  let currentUser = user;
  return {
    calls,
    getAccessToken: () => currentToken,
    setAccessToken: (nextToken) => {
      calls.push(["setAccessToken", nextToken]);
      currentToken = nextToken;
    },
    clearAccessToken: () => {
      calls.push(["clearAccessToken"]);
      currentToken = null;
    },
    getStoredUser: () => currentUser,
    setStoredUser: (nextUser) => {
      calls.push(["setStoredUser", nextUser]);
      currentUser = nextUser;
    },
    clearAuthSession: () => {
      calls.push(["clearAuthSession"]);
      currentToken = null;
      currentUser = null;
    },
  };
};

test("bootstrapAuth prefers refresh cookie and stores the returned token and user", async () => {
  const user = { id: "user-1", email: "alice@example.com" };
  const tokenStore = createTokenStore();

  const state = await bootstrapAuth({
    tokenStore,
    refreshSession: async () => ({ success: true, token: "new-access-token", user }),
  });

  assert.deepEqual(state, {
    status: "authenticated",
    source: "refresh-cookie",
    token: "new-access-token",
    user,
  });
  assert.deepEqual(tokenStore.calls, [
    ["setAccessToken", "new-access-token"],
    ["setStoredUser", user],
  ]);
});

test("bootstrapAuth falls back to the existing local token when refresh is unavailable", async () => {
  const user = { id: "user-1" };
  const tokenStore = createTokenStore({ token: "stored-token", user });

  const state = await bootstrapAuth({
    tokenStore,
    refreshSession: async () => {
      const error = new Error("missing cookie");
      error.status = 401;
      throw error;
    },
  });

  assert.deepEqual(state, {
    status: "authenticated",
    source: "local-storage-fallback",
    token: "stored-token",
    user,
  });
});

test("bootstrapAuth returns unauthenticated when refresh and local fallback are unavailable", async () => {
  const tokenStore = createTokenStore();

  const state = await bootstrapAuth({
    tokenStore,
    refreshSession: async () => ({ success: false }),
  });

  assert.deepEqual(state, {
    status: "unauthenticated",
    source: "none",
    token: null,
    user: null,
  });
});

test("logoutAuth clears the backend cookie when possible and always clears client auth state", async () => {
  const tokenStore = createTokenStore({ token: "stored-token", user: { id: "user-1" } });
  const calls = [];

  const state = await logoutAuth({
    tokenStore,
    logoutSession: async () => {
      calls.push("logoutSession");
      return { success: true };
    },
  });

  assert.deepEqual(calls, ["logoutSession"]);
  assert.deepEqual(tokenStore.calls, [["clearAuthSession"]]);
  assert.deepEqual(state, {
    status: "unauthenticated",
    source: "logout",
    token: null,
    user: null,
  });
});
