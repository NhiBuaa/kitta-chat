import test from "node:test";
import assert from "node:assert/strict";

import { canStartOutgoingCall } from "./callPageState.js";

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
