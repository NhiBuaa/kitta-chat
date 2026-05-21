import test from "node:test";
import assert from "node:assert/strict";

import {
    applyFriendRemovedToActiveChat,
    applyFriendRemovedToList,
} from "./friendshipState.js";

const friend = {
    _id: "friend-1",
    displayName: "Friend",
    isFriend: true,
    isSent: true,
    isReceived: true,
    isIncomingRequest: true,
    lastMessage: { content: "hello" },
};

test("friendRemoved with messages keeps sidebar row as non-friend", () => {
    const updated = applyFriendRemovedToList([friend], {
        removedUserId: "friend-1",
        hadMessages: true,
    });

    assert.equal(updated.length, 1);
    assert.equal(updated[0].isFriend, false);
    assert.equal(updated[0].isSent, false);
    assert.equal(updated[0].isReceived, false);
    assert.equal(updated[0].isIncomingRequest, false);
    assert.deepEqual(updated[0].lastMessage, friend.lastMessage);
});

test("friendRemoved without messages removes sidebar row", () => {
    const updated = applyFriendRemovedToList([friend, { _id: "friend-2" }], {
        removedUserId: "friend-1",
        hadMessages: false,
    });

    assert.deepEqual(updated, [{ _id: "friend-2" }]);
});

test("friendRemoved updates search result as non-friend even without messages", () => {
    const updated = applyFriendRemovedToList([friend], {
        removedUserId: "friend-1",
        hadMessages: false,
        removeWhenNoMessages: false,
    });

    assert.equal(updated.length, 1);
    assert.equal(updated[0].isFriend, false);
    assert.equal(updated[0].isSent, false);
    assert.equal(updated[0].isReceived, false);
    assert.equal(updated[0].isIncomingRequest, false);
});

test("friendRemoved updates active chat safely", () => {
    const updated = applyFriendRemovedToActiveChat(friend, {
        removedUserId: "friend-1",
        hadMessages: false,
    });

    assert.equal(updated.isFriend, false);
    assert.equal(updated.isSent, false);
    assert.equal(updated.isReceived, false);
    assert.equal(updated.isIncomingRequest, false);
});

test("friendRemoved ignores groups and unrelated active chat", () => {
    const group = { _id: "group-1", members: ["me", "friend-1"], isFriend: false };
    const other = { _id: "friend-2", isFriend: true };

    assert.equal(applyFriendRemovedToActiveChat(group, { removedUserId: "friend-1" }), group);
    assert.equal(applyFriendRemovedToActiveChat(other, { removedUserId: "friend-1" }), other);
});
