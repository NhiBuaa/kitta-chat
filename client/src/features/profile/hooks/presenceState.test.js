import assert from "node:assert/strict";
import test from "node:test";

import { isUserOnline } from "./presenceState.js";

test("isUserOnline returns true when onlineUsers contains userId", () => {
    assert.equal(
        isUserOnline([{ userId: "user-1" }], { _id: "user-1" }),
        true,
    );
});

test("isUserOnline returns false when only cached active activityStatus says online", () => {
    assert.equal(
        isUserOnline([], {
            _id: "user-1",
            activityStatus: { state: "active" },
        }),
        false,
    );
});

test("isUserOnline returns false when only cached online activityStatus says online", () => {
    assert.equal(
        isUserOnline([], {
            _id: "user-1",
            activityStatus: { state: "online" },
        }),
        false,
    );
});

test("isUserOnline returns false for missing user id or user object", () => {
    assert.equal(isUserOnline([{ userId: "user-1" }], null), false);
    assert.equal(isUserOnline([{ userId: "user-1" }], {}), false);
    assert.equal(isUserOnline([{ userId: "user-1" }], ""), false);
});
