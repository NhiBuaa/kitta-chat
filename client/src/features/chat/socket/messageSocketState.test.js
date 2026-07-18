import test from "node:test";
import assert from "node:assert/strict";

import {
    appendIncomingChatMessage,
    normalizeRecoveredMessage,
    updateListWithMessagePreview,
    upsertCallLogMessage,
    checkIfConversationMuted,
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

const baseGroupList = () => [
    {
        _id: "group-1",
        name: "Project Group",
        members: ["me", "friend-1", "friend-2"],
        lastMessage: {
            content: "Old group message",
            senderId: "friend-2",
            createdAt: "2026-05-18T08:00:00.000Z",
            isRead: true,
            messageId: "old-group-message",
        },
        hasUnread: false,
        unreadCount: 0,
    },
    {
        _id: "group-2",
        name: "Quiet Group",
        members: ["me", "friend-3", "friend-4"],
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

test("inactive group message updates preview and increments unread state", () => {
    const updated = updateListWithMessagePreview(baseGroupList(), {
        data: {
            _id: "group-message-1",
            createdAt: "2026-05-18T10:00:00.000Z",
        },
        targetId: "group-1",
        senderId: "friend-1",
        isUnread: true,
        isCallLog: false,
        previewContent: "Hello group",
    });

    assert.equal(updated[0]._id, "group-1");
    assert.deepEqual(updated[0].lastMessage, {
        content: "Hello group",
        senderId: "friend-1",
        createdAt: "2026-05-18T10:00:00.000Z",
        isRead: false,
        messageId: "group-message-1",
        callHistoryId: null,
    });
    assert.equal(updated[0].hasUnread, true);
    assert.equal(updated[0].unreadCount, 1);
});

test("active group message updates preview without incrementing unread state", () => {
    const updated = updateListWithMessagePreview(baseGroupList(), {
        data: {
            _id: "group-message-2",
            createdAt: "2026-05-18T10:05:00.000Z",
        },
        targetId: "group-1",
        senderId: "friend-1",
        isUnread: false,
        isCallLog: false,
        previewContent: "Viewed group message",
    });

    assert.equal(updated[0]._id, "group-1");
    assert.equal(updated[0].lastMessage.content, "Viewed group message");
    assert.equal(updated[0].lastMessage.isRead, true);
    assert.equal(updated[0].hasUnread, false);
    assert.equal(updated[0].unreadCount, 0);
});

test("recovered group message normalizes conversation id into receiver id", () => {
    const recovered = normalizeRecoveredMessage({
        _id: "recovered-group-1",
        conversationId: "group-1",
        sender: { _id: "friend-1", displayName: "Friend One" },
        receiver: "group-1",
        text: "Recovered group message",
        type: "text",
        createdAt: "2026-05-18T10:10:00.000Z",
    });

    assert.equal(recovered.isGroup, true);
    assert.equal(recovered.receiverId, "group-1");
});

test("duplicate recovered group message does not increment unread twice", () => {
    const recovered = normalizeRecoveredMessage({
        _id: "recovered-group-2",
        conversationId: "group-1",
        sender: { _id: "friend-1", displayName: "Friend One" },
        receiver: "group-1",
        text: "Recovered duplicate",
        type: "text",
        createdAt: "2026-05-18T10:15:00.000Z",
    });
    const updateOptions = {
        data: recovered,
        targetId: recovered.receiverId,
        senderId: recovered.sender._id,
        isUnread: true,
        isCallLog: false,
        previewContent: recovered.text,
    };

    const once = updateListWithMessagePreview(baseGroupList(), updateOptions);
    const twice = updateListWithMessagePreview(once, updateOptions);

    assert.equal(twice[0]._id, "group-1");
    assert.equal(twice[0].lastMessage.messageId, "recovered-group-2");
    assert.equal(twice[0].unreadCount, 1);
});

test("sidebar item hydrated with messageId does not increment for same recovered message", () => {
    const hydrated = [
        {
            ...baseFriendList()[0],
            unreadCount: 1,
            hasUnread: true,
            lastMessage: {
                content: "Recovered text",
                senderId: "friend-1",
                createdAt: "2026-05-18T11:00:00.000Z",
                isRead: false,
                messageId: "message-1",
                callHistoryId: null,
            },
        },
    ];

    const updated = updateListWithMessagePreview(hydrated, {
        data: {
            _id: "message-1",
            createdAt: "2026-05-18T11:00:00.000Z",
        },
        targetId: "friend-1",
        senderId: "friend-1",
        isUnread: true,
        isCallLog: false,
        previewContent: "Recovered text",
    });

    assert.equal(updated[0].unreadCount, 1);
});

test("sidebar item hydrated with callHistoryId does not increment for same recovered call_log", () => {
    const hydrated = [
        {
            ...baseFriendList()[0],
            unreadCount: 1,
            hasUnread: true,
            lastMessage: {
                content: "[Cuộc gọi video]",
                senderId: "friend-1",
                createdAt: "2026-05-18T11:05:00.000Z",
                isRead: false,
                messageId: "call-message-1",
                callHistoryId: "call-history-1",
            },
        },
    ];

    const updated = updateListWithMessagePreview(hydrated, {
        data: {
            _id: "call-message-1",
            type: "call_log",
            callData: {
                callHistoryId: "call-history-1",
                status: "missed",
                type: "video",
            },
            createdAt: "2026-05-18T11:05:00.000Z",
        },
        targetId: "friend-1",
        senderId: "friend-1",
        isUnread: true,
        isCallLog: true,
        previewContent: "[Cuộc gọi video]",
    });

    assert.equal(updated[0].unreadCount, 1);
});

test("checkIfConversationMuted direct chat cases", () => {
    const users = [
        { _id: "user-unmuted", isMuted: false, mutedUntil: null },
        { _id: "user-muted-flag", isMuted: true, mutedUntil: null },
        { _id: "user-muted-future", isMuted: false, mutedUntil: new Date(Date.now() + 3600000).toISOString() },
        { _id: "user-muted-past", isMuted: false, mutedUntil: new Date(Date.now() - 3600000).toISOString() }
    ];

    // Case 1: Unmuted
    assert.equal(checkIfConversationMuted({ isGroup: false }, { users, targetId: "user-unmuted" }), false);

    // Case 2: Muted via flag
    assert.equal(checkIfConversationMuted({ isGroup: false }, { users, targetId: "user-muted-flag" }), true);

    // Case 3: Muted via future date
    assert.equal(checkIfConversationMuted({ isGroup: false }, { users, targetId: "user-muted-future" }), true);

    // Case 4: Unmuted via past date
    assert.equal(checkIfConversationMuted({ isGroup: false }, { users, targetId: "user-muted-past" }), false);

    // Case 5: Brand new user not in list
    assert.equal(checkIfConversationMuted({ isGroup: false }, { users, targetId: "user-new" }), false);
});

test("checkIfConversationMuted group chat cases", () => {
    const groups = [
        { _id: "group-unmuted", isMuted: false, mutedUntil: null },
        { _id: "group-muted-flag", isMuted: true, mutedUntil: null },
        { _id: "group-muted-future", isMuted: false, mutedUntil: new Date(Date.now() + 3600000).toISOString() },
        { _id: "group-muted-past", isMuted: false, mutedUntil: new Date(Date.now() - 3600000).toISOString() }
    ];

    // Case 1: Unmuted
    assert.equal(checkIfConversationMuted({ isGroup: true }, { groups, receiverId: "group-unmuted" }), false);

    // Case 2: Muted via flag
    assert.equal(checkIfConversationMuted({ isGroup: true }, { groups, receiverId: "group-muted-flag" }), true);

    // Case 3: Muted via future date
    assert.equal(checkIfConversationMuted({ isGroup: true }, { groups, receiverId: "group-muted-future" }), true);

    // Case 4: Unmuted via past date
    assert.equal(checkIfConversationMuted({ isGroup: true }, { groups, receiverId: "group-muted-past" }), false);

    // Case 5: Brand new group not in list
    assert.equal(checkIfConversationMuted({ isGroup: true }, { groups, receiverId: "group-new" }), false);
});

