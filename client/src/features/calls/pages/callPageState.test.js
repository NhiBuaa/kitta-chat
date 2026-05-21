import test from "node:test";
import assert from "node:assert/strict";

import { canStartOutgoingCall, getPreAnswerCancelReason } from "./callPageState.js";

test("outgoing call can start even when onlineUsers does not include partner", () => {
    assert.equal(canStartOutgoingCall({
        socket: { id: "socket-b" },
        partnerId: "222222222222222222222222",
        stream: { id: "local-stream" },
        mediaError: false,
        onlineUsers: [],
    }), true);
});

test("outgoing call is blocked only by invalid local call prerequisites", () => {
    assert.equal(canStartOutgoingCall({
        socket: null,
        partnerId: "222222222222222222222222",
        stream: { id: "local-stream" },
        mediaError: false,
    }), false);

    assert.equal(canStartOutgoingCall({
        socket: { id: "socket-b" },
        partnerId: "",
        stream: { id: "local-stream" },
        mediaError: false,
    }), false);

    assert.equal(canStartOutgoingCall({
        socket: { id: "socket-b" },
        partnerId: "222222222222222222222222",
        stream: null,
        mediaError: false,
    }), false);

    assert.equal(canStartOutgoingCall({
        socket: { id: "socket-b" },
        partnerId: "222222222222222222222222",
        stream: { id: "local-stream" },
        mediaError: true,
    }), false);
});

test("incoming receiver pre-call cancel emits rejected reason", () => {
    assert.equal(getPreAnswerCancelReason({ isIncoming: true }), "rejected");
});

test("outgoing caller cancel before answer still emits cancelled reason", () => {
    assert.equal(getPreAnswerCancelReason({ isIncoming: false }), "cancelled");
});
