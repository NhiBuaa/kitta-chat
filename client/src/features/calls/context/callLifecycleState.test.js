import assert from "node:assert/strict";
import test from "node:test";

import { getLeaveCallEvent } from "./callLifecycleState.js";

test("leave before answer emits caller cancel/reject event", () => {
    assert.deepEqual(getLeaveCallEvent({
        socket: { id: "socket-1" },
        partnerUserId: "user-b",
        callId: "call-1",
        callAccepted: false,
    }), {
        event: "rejectCall",
        payload: { to: "user-b", callId: "call-1", reason: "cancelled" },
    });
});

test("leave after answer emits end event, not reject", () => {
    assert.deepEqual(getLeaveCallEvent({
        socket: { id: "socket-1" },
        partnerUserId: "user-a",
        callId: "call-1",
        callAccepted: true,
    }), {
        event: "endCall",
        payload: { to: "user-a", callId: "call-1" },
    });
});

test("leave without socket, partner, or call id emits nothing", () => {
    assert.equal(getLeaveCallEvent({ socket: null, partnerUserId: "user-a", callId: "call-1", callAccepted: true }), null);
    assert.equal(getLeaveCallEvent({ socket: { id: "socket-1" }, partnerUserId: null, callId: "call-1", callAccepted: true }), null);
    assert.equal(getLeaveCallEvent({ socket: { id: "socket-1" }, partnerUserId: "user-a", callId: null, callAccepted: true }), null);
});
