import test from "node:test";
import assert from "node:assert/strict";

import { runRemoveFriendAction } from "./removeFriendAction.js";

const createToast = () => {
    const calls = [];
    return {
        calls,
        success(message) {
            calls.push(["success", message]);
        },
        info(message) {
            calls.push(["info", message]);
        },
        error(message) {
            calls.push(["error", message]);
        },
    };
};

test("remove friend asks for confirmation before calling API", async () => {
    let apiCalls = 0;

    const result = await runRemoveFriendAction({
        friendId: "friend-1",
        friendName: "Alice",
        confirmRemove(message) {
            assert.match(message, /Alice/);
            return false;
        },
        removeFriend: async () => {
            apiCalls += 1;
        },
    });

    assert.deepEqual(result, { cancelled: true });
    assert.equal(apiCalls, 0);
});

test("remove friend toggles loading state around API call", async () => {
    const loadingRef = { current: false };
    const loadingStates = [];

    await runRemoveFriendAction({
        friendId: "friend-1",
        confirmRemove: () => true,
        loadingRef,
        setLoading: (value) => loadingStates.push(value),
        removeFriend: async () => ({ data: { success: true } }),
    });

    assert.deepEqual(loadingStates, [true, false]);
    assert.equal(loadingRef.current, false);
});

test("remove friend prevents duplicate clicks while request is in flight", async () => {
    const result = await runRemoveFriendAction({
        friendId: "friend-1",
        confirmRemove: () => true,
        loadingRef: { current: true },
        removeFriend: async () => {
            throw new Error("should not call");
        },
    });

    assert.deepEqual(result, { skipped: true, duplicate: true });
});

test("remove friend calls API successfully", async () => {
    const toast = createToast();
    const calls = [];

    const result = await runRemoveFriendAction({
        friendId: "friend-1",
        confirmRemove: () => true,
        toast,
        removeFriend: async (friendId) => {
            calls.push(friendId);
            return { data: { success: true } };
        },
    });

    assert.deepEqual(calls, ["friend-1"]);
    assert.deepEqual(result, { success: true, alreadyRemoved: false });
    assert.equal(toast.calls[0][0], "success");
});

test("remove friend handles alreadyRemoved safely", async () => {
    const toast = createToast();

    const result = await runRemoveFriendAction({
        friendId: "friend-1",
        confirmRemove: () => true,
        toast,
        removeFriend: async () => ({ data: { success: true, alreadyRemoved: true } }),
    });

    assert.deepEqual(result, { success: true, alreadyRemoved: true });
    assert.equal(toast.calls[0][0], "info");
});

test("remove friend shows error toast and leaves final UI state to realtime sync", async () => {
    const toast = createToast();
    const loadingRef = { current: false };
    const error = { response: { data: { message: "Boom" } } };

    const result = await runRemoveFriendAction({
        friendId: "friend-1",
        confirmRemove: () => true,
        toast,
        loadingRef,
        setLoading: () => {},
        removeFriend: async () => {
            throw error;
        },
    });

    assert.equal(result.success, false);
    assert.equal(result.error, error);
    assert.deepEqual(toast.calls, [["error", "Boom"]]);
    assert.equal(loadingRef.current, false);
});
