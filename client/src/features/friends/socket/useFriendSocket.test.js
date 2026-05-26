import test from "node:test";
import assert from "node:assert/strict";

import { registerFriendSocketListeners } from "./useFriendSocket.js";

const createSocket = () => {
    const listeners = new Map();
    return {
        listeners,
        on(eventName, handler) {
            listeners.set(eventName, handler);
        },
        off(eventName, handler) {
            if (listeners.get(eventName) === handler) {
                listeners.delete(eventName);
            }
        },
        emitIncoming(eventName, payload) {
            listeners.get(eventName)?.(payload);
        },
    };
};

test("friendRemoved socket event calls markFriendshipRemoved", () => {
    const socket = createSocket();
    const calls = [];

    registerFriendSocketListeners({
        socket,
        setRequestCount: () => {},
        patchUserEverywhere: () => {},
        markFriendRequestSent: () => {},
        markFriendshipActive: () => {},
        clearSentFriendRequest: () => {},
        markFriendshipRemoved: (payload) => calls.push(payload),
        toast: { info() {}, success() {} },
    });

    const payload = {
        removedUserId: "friend-1",
        byUserId: "me",
        conversationId: "friend-1_me",
        hadMessages: true,
    };
    socket.emitIncoming("friendRemoved", payload);

    assert.deepEqual(calls, [payload]);
});

test("friendRemoved listener is cleaned up", () => {
    const socket = createSocket();

    const cleanup = registerFriendSocketListeners({
        socket,
        setRequestCount: () => {},
        patchUserEverywhere: () => {},
        markFriendRequestSent: () => {},
        markFriendshipActive: () => {},
        clearSentFriendRequest: () => {},
        markFriendshipRemoved: () => {},
        toast: { info() {}, success() {} },
    });

    assert.equal(socket.listeners.has("friendRemoved"), true);
    cleanup();
    assert.equal(socket.listeners.has("friendRemoved"), false);
});
