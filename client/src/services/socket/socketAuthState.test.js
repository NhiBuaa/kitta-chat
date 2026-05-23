import assert from "node:assert/strict";
import test from "node:test";

import { getSocketAuthState } from "./socketAuthState.js";

test("socket auth waits while auth bootstrap is checking", () => {
    const state = getSocketAuthState({
        isChecking: true,
        isAuthenticated: true,
        token: "access-token",
        user: { id: "user-1" },
    });

    assert.deepEqual(state, { shouldConnect: false, token: null, user: null });
});

test("socket auth does not connect when unauthenticated", () => {
    const state = getSocketAuthState({
        isChecking: false,
        isAuthenticated: false,
        token: "access-token",
        user: { id: "user-1" },
    });

    assert.deepEqual(state, { shouldConnect: false, token: null, user: null });
});

test("socket auth requires the AuthProvider token", () => {
    const state = getSocketAuthState({
        isChecking: false,
        isAuthenticated: true,
        token: null,
        user: { id: "user-1" },
        fallbackUser: { id: "fallback-user" },
    });

    assert.equal(state.shouldConnect, false);
    assert.equal(state.token, null);
    assert.deepEqual(state.user, { id: "user-1" });
});

test("socket auth connects with the AuthProvider token and user", () => {
    const state = getSocketAuthState({
        isChecking: false,
        isAuthenticated: true,
        token: "fresh-access-token",
        user: { _id: "user-1" },
        fallbackUser: { _id: "fallback-user" },
    });

    assert.deepEqual(state, {
        shouldConnect: true,
        token: "fresh-access-token",
        user: { _id: "user-1" },
    });
});

test("socket auth can temporarily use stored user fallback", () => {
    const state = getSocketAuthState({
        isChecking: false,
        isAuthenticated: true,
        token: "fresh-access-token",
        user: null,
        fallbackUser: { id: "stored-user" },
    });

    assert.deepEqual(state, {
        shouldConnect: true,
        token: "fresh-access-token",
        user: { id: "stored-user" },
    });
});
