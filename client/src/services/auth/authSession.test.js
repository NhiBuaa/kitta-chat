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
});

test.afterEach(() => {
  delete globalThis.localStorage;
});

test("access token helpers preserve current localStorage behavior", () => {
  assert.equal(getAccessToken(), null);

  setAccessToken("jwt-token");

  assert.equal(globalThis.localStorage.getItem("token"), "jwt-token");
  assert.equal(getAccessToken(), "jwt-token");

  clearAccessToken();

  assert.equal(globalThis.localStorage.getItem("token"), null);
  assert.equal(getAccessToken(), null);
});

test("stored user helpers serialize and clear the current user", () => {
  const user = { id: "user-1", displayName: "Kitta" };

  setStoredUser(user);

  assert.deepEqual(getStoredUser(), user);
  assert.equal(globalThis.localStorage.getItem("user"), JSON.stringify(user));

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
