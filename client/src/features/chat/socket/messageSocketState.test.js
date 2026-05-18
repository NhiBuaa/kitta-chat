import test from "node:test";
import assert from "node:assert/strict";

import {
    appendIncomingChatMessage,
    normalizeRecoveredMessage,
    updateListWithMessagePreview,
    upsertCallLogMessage,
} from "./messageSocketState.js";

const baseFriendList = () => [
    {
        _id: "friend-1",
        displayName: "Friend One",
        lastMessage: {
            content: "Old message",
            senderId: "me",
            createdAt: "2026-05-18T08:00:00.000Z",
            isRead: true,
            messageId: "old-message",
        },
        hasUnread: false,
        unreadCount: 0,
    },
    {
        _id: "friend-2",
        displayName: "Friend Two",
        lastMessage: null,
        hasUnread: false,
        unreadCount: 0,
    },
];

test("direct incoming message updates the conversation preview", () => {
    const updated = updateListWithMessagePreview(baseFriendList(), {
        data: {
            _id: "message-1",
            createdAt: "2026-05-18T09:00:00.000Z",
        },
        targetId: "friend-1",
        senderId: "friend-1",
        isUnread: true,
        isCallLog: false,
        previewContent: "Hello from direct chat",
    });

    assert.equal(updated[0]._id, "friend-1");
    assert.deepEqual(updated[0].lastMessage, {
        content: "Hello from direct chat",
        senderId: "friend-1",
        createdAt: "2026-05-18T09:00:00.000Z",
        isRead: false,
        messageId: "message-1",
        callHistoryId: null,
    });
});

test("inactive direct chat increments unread state", () => {
    const updated = updateListWithMessagePreview(baseFriendList(), {
        data: {
            _id: "message-2",
            createdAt: "2026-05-18T09:05:00.000Z",
        },
        targetId: "friend-1",
        senderId: "friend-1",
        isUnread: true,
        isCallLog: false,
        previewContent: "Unread message",
    });

    assert.equal(updated[0].hasUnread, true);
    assert.equal(updated[0].unreadCount, 1);
    assert.equal(updated[0].lastMessage.isRead, false);
});

test("active direct chat keeps unread state clear", () => {
    const updated = updateListWithMessagePreview(baseFriendList(), {
        data: {
            _id: "message-3",
            createdAt: "2026-05-18T09:10:00.000Z",
        },
        targetId: "friend-1",
        senderId: "friend-1",
        isUnread: false,
        isCallLog: false,
        previewContent: "Viewed message",
    });

    assert.equal(updated[0].hasUnread, false);
    assert.equal(updated[0].unreadCount, 0);
    assert.equal(updated[0].lastMessage.isRead, true);
});

test("recovered direct messages dedupe by message id", () => {
    const recovered = normalizeRecoveredMessage({
        _id: "recovered-1",
        conversationId: "friend-1_me",
        sender: { _id: "friend-1", displayName: "Friend One" },
        receiver: "me",
        text: "Recovered message",
        type: "text",
        createdAt: "2026-05-18T09:15:00.000Z",
    });

    const once = appendIncomingChatMessage([], recovered, {
        senderId: "friend-1",
        resolvedAttachments: [],
    });
    const twice = appendIncomingChatMessage(once, recovered, {
        senderId: "friend-1",
        resolvedAttachments: [],
    });

    assert.equal(recovered.isGroup, false);
    assert.equal(recovered.receiverId, "me");
    assert.equal(twice.length, 1);
    assert.equal(twice[0]._id, "recovered-1");
});

test("call log upsert dedupes by call history id or message id", () => {
    const first = upsertCallLogMessage([], {
        _id: "call-message-1",
        sender: "friend-1",
        receiver: "me",
        text: "Missed call",
        callData: {
            callHistoryId: "call-history-1",
            status: "missed",
            type: "audio",
        },
        createdAt: "2026-05-18T09:20:00.000Z",
    });

    const byCallHistoryId = upsertCallLogMessage(first, {
        _id: "call-message-2",
        sender: "friend-1",
        receiver: "me",
        text: "Missed call updated",
        callData: {
            callHistoryId: "call-history-1",
            status: "completed",
            type: "audio",
        },
        createdAt: "2026-05-18T09:21:00.000Z",
    });

    const byMessageId = upsertCallLogMessage(byCallHistoryId, {
        _id: "call-message-2",
        sender: "friend-1",
        receiver: "me",
        text: "Missed call updated again",
        callData: {
            callHistoryId: "call-history-1",
            duration: 30,
            type: "audio",
        },
        createdAt: "2026-05-18T09:22:00.000Z",
    });

    assert.equal(byCallHistoryId.length, 1);
    assert.equal(byCallHistoryId[0]._id, "call-message-2");
    assert.equal(byCallHistoryId[0].callData.status, "completed");

    assert.equal(byMessageId.length, 1);
    assert.equal(byMessageId[0]._id, "call-message-2");
    assert.equal(byMessageId[0].callData.callHistoryId, "call-history-1");
    assert.equal(byMessageId[0].callData.duration, 30);
});
