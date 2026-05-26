import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAccessToken,
  clearAuthSession,
  clearStoredUser,
  getAccessToken,
  getStoredUser,
  setAccessToken,
  setStoredUser,
  resetAuthSessionMemoryForTests,
} from "./authSession.js";

const createLocalStorageMock = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
};

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock();
  resetAuthSessionMemoryForTests();
});

test.afterEach(() => {
  resetAuthSessionMemoryForTests();
  delete globalThis.localStorage;
});

test("access token helpers keep token in memory only", () => {
  assert.equal(getAccessToken(), null);

  setAccessToken("jwt-token");

  assert.equal(globalThis.localStorage.getItem("token"), null);
  assert.equal(getAccessToken(), "jwt-token");

  clearAccessToken();

  assert.equal(globalThis.localStorage.getItem("token"), null);
  assert.equal(getAccessToken(), null);
});

test("stored user helpers keep the current user in memory only", () => {
  const user = { id: "user-1", displayName: "Kitta" };

  setStoredUser(user);

  assert.deepEqual(getStoredUser(), user);
  assert.equal(globalThis.localStorage.getItem("user"), null);

  clearStoredUser();

  assert.equal(globalThis.localStorage.getItem("user"), null);
  assert.equal(getStoredUser(), null);
});

test("clearAuthSession clears token and stored user together", () => {
  setAccessToken("jwt-token");
  setStoredUser({ id: "user-1" });

  clearAuthSession();

  assert.equal(getAccessToken(), null);
  assert.equal(getStoredUser(), null);
});


test("access token ignores localStorage when memory is empty", () => {
  globalThis.localStorage.setItem("token", "stored-token");

  assert.equal(getAccessToken(), null);
});

test("memory access token is not affected by localStorage", () => {
  globalThis.localStorage.setItem("token", "stored-token");

  setAccessToken("memory-token");
  globalThis.localStorage.setItem("token", "stale-token");

  assert.equal(getAccessToken(), "memory-token");
});

test("clearAccessToken clears memory and removes legacy localStorage token", () => {
  globalThis.localStorage.setItem("token", "legacy-token");
  setAccessToken("memory-token");

  clearAccessToken();

  assert.equal(globalThis.localStorage.getItem("token"), null);
  assert.equal(getAccessToken(), null);
});

test("stored user ignores localStorage fallback when memory is empty", () => {
  const user = { id: "user-1", displayName: "Stored" };
  globalThis.localStorage.setItem("user", JSON.stringify(user));

  assert.equal(getStoredUser(), null);
});

test("memory stored user is not affected by localStorage", () => {
  const memoryUser = { id: "user-1", displayName: "Memory" };
  const storedUser = { id: "user-1", displayName: "Stored" };
  globalThis.localStorage.setItem("user", JSON.stringify(storedUser));

  setStoredUser(memoryUser);
  assert.equal(globalThis.localStorage.getItem("user"), null);

  globalThis.localStorage.setItem("user", JSON.stringify({ id: "user-1", displayName: "Stale" }));

  assert.deepEqual(getStoredUser(), memoryUser);
});

test("malformed localStorage user returns null when memory is empty", () => {
  globalThis.localStorage.setItem("user", "not-json");

  assert.equal(getStoredUser(), null);
});

test("clearAuthSession clears memory token, legacy token, and persisted user", () => {
  globalThis.localStorage.setItem("token", "legacy-token");
  globalThis.localStorage.setItem("last_message_id", "message-1");
  setAccessToken("memory-token");
  setStoredUser({ id: "user-1" });

  clearAuthSession();

  assert.equal(globalThis.localStorage.getItem("token"), null);
  assert.equal(globalThis.localStorage.getItem("user"), null);
  assert.equal(globalThis.localStorage.getItem("last_message_id"), "message-1");
  assert.equal(getAccessToken(), null);
  assert.equal(getStoredUser(), null);
});
