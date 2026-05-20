const assert = require("node:assert/strict");
const test = require("node:test");

const { _buildSidebarLastMessage } = require("../src/controllers/userController");

test("sidebar lastMessage includes messageId for normal text message", () => {
  const message = {
    _id: { toString: () => "message-1" },
    text: "Hello",
    type: "text",
    sender: "friend-1",
    createdAt: new Date("2026-05-20T10:00:00.000Z"),
    isRead: false,
  };

  assert.deepEqual(_buildSidebarLastMessage(message), {
    content: "Hello",
    senderId: "friend-1",
    createdAt: message.createdAt,
    isRead: false,
    messageId: "message-1",
    callHistoryId: null,
  });
});

test("sidebar lastMessage includes callHistoryId for call_log message", () => {
  const message = {
    _id: { toString: () => "call-message-1" },
    text: "",
    type: "call_log",
    sender: "friend-1",
    createdAt: new Date("2026-05-20T10:05:00.000Z"),
    isRead: false,
    callData: {
      type: "video",
      callHistoryId: { toString: () => "call-history-1" },
    },
  };

  assert.deepEqual(_buildSidebarLastMessage(message), {
    content: "[Cuộc gọi video]",
    senderId: "friend-1",
    createdAt: message.createdAt,
    isRead: false,
    messageId: "call-message-1",
    callHistoryId: "call-history-1",
  });
});

test("sidebar lastMessage preserves existing unread isRead field", () => {
  const unreadMessage = _buildSidebarLastMessage({
    _id: "message-2",
    text: "Unread",
    type: "text",
    sender: "friend-1",
    createdAt: new Date("2026-05-20T10:10:00.000Z"),
    isRead: false,
  });
  const readMessage = _buildSidebarLastMessage({
    _id: "message-3",
    text: "Read",
    type: "text",
    sender: "friend-1",
    createdAt: new Date("2026-05-20T10:11:00.000Z"),
    isRead: true,
  });

  assert.equal(unreadMessage.isRead, false);
  assert.equal(readMessage.isRead, true);
});
