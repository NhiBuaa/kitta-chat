import assert from "node:assert/strict";
import test from "node:test";
import { SidebarStateManager } from "./useSidebarState.js";

// Mock localStorage for Node.js test environment
const mockLocalStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  clear() {
    this.store = {};
  }
};
globalThis.localStorage = mockLocalStorage;

test("SidebarStateManager handleSocketMessage updates message preview instantly but debounces sorting", async (t) => {
  mockLocalStorage.clear();
  const initialConversations = [
    {
      conversationId: "conv-2",
      kind: "direct",
      isPinned: false,
      unreadCount: 0,
      lastMessageAt: "2026-07-20T09:00:00.000Z",
      lastMessage: { content: "Old message 2", createdAt: "2026-07-20T09:00:00.000Z" },
      target: { _id: "user-2", displayName: "User 2" }
    },
    {
      conversationId: "conv-1",
      kind: "direct",
      isPinned: false,
      unreadCount: 0,
      lastMessageAt: "2026-07-20T08:00:00.000Z",
      lastMessage: { content: "Old message 1", createdAt: "2026-07-20T08:00:00.000Z" },
      target: { _id: "user-1", displayName: "User 1" }
    }
  ];

  let stateChangeCount = 0;
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false }),
    onStateChange: () => { stateChangeCount++; }
  });

  await manager.init();
  stateChangeCount = 0;

  // Incoming message for conv-1 (currently at index 1)
  const incomingMsg = {
    conversationId: "conv-1",
    senderId: "user-1",
    sender: { _id: "user-1", displayName: "User 1" },
    text: "New instant message!",
    createdAt: "2026-07-20T10:00:00.000Z"
  };

  manager.handleSocketMessage(incomingMsg, {
    activeChat: null,
    currentUserId: "me-user-id",
    debounceMs: 100 // Shortened for test
  });

  // 1. Preview text & lastMessageAt MUST update INSTANTLY (before timer fires)
  const conv1Inst = manager.getConversations().find(c => c.conversationId === "conv-1");
  assert.equal(conv1Inst.lastMessage.content, "New instant message!");
  assert.equal(conv1Inst.lastMessageAt, "2026-07-20T10:00:00.000Z");

  // 2. Physical order in array MUST NOT reorder yet before debounce timer fires
  // conv-2 should still be at index 0, conv-1 at index 1
  assert.equal(manager.getConversations()[0].conversationId, "conv-2");
  assert.equal(manager.getConversations()[1].conversationId, "conv-1");
  assert.equal(stateChangeCount, 1); // 1 instant notification

  // 3. Wait for debounce timer to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  // 4. Now physical order MUST be updated: conv-1 (newest lastMessageAt) moved to index 0
  assert.equal(manager.getConversations()[0].conversationId, "conv-1");
  assert.equal(manager.getConversations()[1].conversationId, "conv-2");
  assert.equal(stateChangeCount, 2); // 2nd notification after sorting

  manager.cleanup();
});

test("SidebarStateManager handleSocketMessage consolidates multiple rapid message events into 1 sort action", async () => {
  mockLocalStorage.clear();
  const initialConversations = [
    { conversationId: "c1", kind: "direct", lastMessageAt: "2026-07-20T01:00:00Z", target: { displayName: "U1" } },
    { conversationId: "c2", kind: "direct", lastMessageAt: "2026-07-20T02:00:00Z", target: { displayName: "U2" } },
    { conversationId: "c3", kind: "direct", lastMessageAt: "2026-07-20T03:00:00Z", target: { displayName: "U3" } }
  ];

  let stateChangeCount = 0;
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false }),
    onStateChange: () => { stateChangeCount++; }
  });

  await manager.init();
  stateChangeCount = 0;

  // 3 rapid messages in 50ms interval
  manager.handleSocketMessage({ conversationId: "c1", senderId: "u1", text: "msg 1", createdAt: "2026-07-20T04:00:00Z" }, { currentUserId: "me", debounceMs: 150 });
  await new Promise(r => setTimeout(r, 30));

  manager.handleSocketMessage({ conversationId: "c2", senderId: "u2", text: "msg 2", createdAt: "2026-07-20T05:00:00Z" }, { currentUserId: "me", debounceMs: 150 });
  await new Promise(r => setTimeout(r, 30));

  manager.handleSocketMessage({ conversationId: "c3", senderId: "u3", text: "msg 3", createdAt: "2026-07-20T06:00:00Z" }, { currentUserId: "me", debounceMs: 150 });

  // 3 instant updates stateChangeCount = 3
  assert.equal(stateChangeCount, 3);

  // Wait for the consolidated debounce window to expire
  await new Promise(r => setTimeout(r, 200));

  // Should have exactly 1 extra re-sort stateChange (total = 4)
  assert.equal(stateChangeCount, 4);

  // Final sorted order: c3 (06:00), c2 (05:00), c1 (04:00)
  const convs = manager.getConversations();
  assert.equal(convs[0].conversationId, "c3");
  assert.equal(convs[1].conversationId, "c2");
  assert.equal(convs[2].conversationId, "c1");

  manager.cleanup();
});

test("SidebarStateManager handleSocketMessage respects Unread Badge & Active Chat Guard", async () => {
  mockLocalStorage.clear();
  const initialConversations = [
    { conversationId: "c1", kind: "direct", unreadCount: 0, lastMessageAt: "2026-07-20T01:00:00Z", target: { _id: "u1", displayName: "U1" } },
    { conversationId: "c2", kind: "direct", unreadCount: 0, lastMessageAt: "2026-07-20T02:00:00Z", target: { _id: "u2", displayName: "U2" } }
  ];

  const emittedSocketEvents = [];
  const mockSocket = {
    emit(event, payload) {
      emittedSocketEvents.push({ event, payload });
    }
  };

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false })
  });

  await manager.init();

  // Case A: Own message -> unreadCount should NOT increment
  manager.handleSocketMessage(
    { conversationId: "c1", senderId: "me-id", text: "My sent message", createdAt: "2026-07-20T03:00:00Z" },
    { currentUserId: "me-id", activeChat: null, socket: mockSocket, debounceMs: 100 }
  );
  assert.equal(manager.getConversations().find(c => c.conversationId === "c1").unreadCount, 0);

  // Case B: Active chat -> unreadCount should NOT increment & MUST emit markRead
  manager.handleSocketMessage(
    { conversationId: "c1", senderId: "u1", text: "Message while active", createdAt: "2026-07-20T04:00:00Z" },
    { currentUserId: "me-id", activeChat: { _id: "u1", conversationId: "c1" }, socket: mockSocket, debounceMs: 100 }
  );
  assert.equal(manager.getConversations().find(c => c.conversationId === "c1").unreadCount, 0);
  assert.equal(emittedSocketEvents.length, 1);
  assert.equal(emittedSocketEvents[0].event, "markRead");

  // Case C: Inactive chat -> unreadCount MUST increment by 1
  manager.handleSocketMessage(
    { conversationId: "c2", senderId: "u2", text: "Message while inactive", createdAt: "2026-07-20T05:00:00Z" },
    { currentUserId: "me-id", activeChat: { _id: "u1", conversationId: "c1" }, socket: mockSocket, debounceMs: 100 }
  );
  assert.equal(manager.getConversations().find(c => c.conversationId === "c2").unreadCount, 1);

  manager.cleanup();
});

test("SidebarStateManager handleSocketMessage ingests new conversation when receiving message from unknown chat", async () => {
  mockLocalStorage.clear();
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: [], nextCursor: null, hasMore: false })
  });

  await manager.init();

  const newMsg = {
    conversationId: "new-conv-99",
    isGroup: false,
    senderId: "new-user-99",
    sender: { _id: "new-user-99", displayName: "New Friend", avatar: "avatar-url" },
    text: "Hello from new chat!",
    createdAt: "2026-07-20T10:00:00Z",
    target: { _id: "new-user-99", displayName: "New Friend", avatar: "avatar-url" }
  };

  manager.handleSocketMessage(newMsg, {
    currentUserId: "me-id",
    activeChat: null,
    debounceMs: 100
  });

  const convs = manager.getConversations();
  assert.equal(convs.length, 1);
  assert.equal(convs[0].conversationId, "new-conv-99");
  assert.equal(convs[0].target.displayName, "New Friend");
  assert.equal(convs[0].lastMessage.content, "Hello from new chat!");
  assert.equal(convs[0].unreadCount, 1);

  manager.cleanup();
});

test("useMessageSocket callback integration triggers sidebarState handleSocketMessage on incoming socket event", () => {
  let socketHandler = null;
  const mockSocket = {
    on(event, handler) {
      if (event === "getMessage") socketHandler = handler;
    },
    off() {}
  };

  const incomingSocketData = {
    _id: "msg-realtime-1",
    conversationId: "conv-b",
    senderId: "user-b",
    sender: { _id: "user-b", displayName: "User B" },
    text: "Realtime hello from B!",
    createdAt: "2026-07-20T12:00:00Z"
  };

  const initialConversations = [
    {
      conversationId: "conv-b",
      kind: "direct",
      isPinned: false,
      unreadCount: 0,
      lastMessageAt: "2026-07-20T08:00:00.000Z",
      lastMessage: { content: "Old message", createdAt: "2026-07-20T08:00:00.000Z" },
      target: { _id: "user-b", displayName: "User B" }
    }
  ];

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false })
  });
  manager.init();

  let socketCallbackCalledWith = null;

  // Giả lập logic handler của useMessageSocket với callback onSocketMessage
  const handleUnifiedMessage = (data) => {
    // Callback được truyền vào useMessageSocket
    manager.handleSocketMessage(data, { activeChat: null, currentUserId: "user-a" });
    socketCallbackCalledWith = data;
  };

  mockSocket.on("getMessage", handleUnifiedMessage);

  // Giả lập socket nhận message "getMessage" từ server
  socketHandler(incomingSocketData);

  assert.notEqual(socketCallbackCalledWith, null);
  assert.equal(socketCallbackCalledWith._id, "msg-realtime-1");

  // Verify rằng manager.conversations đã được cập nhật realtime lập tức mà không cần fetch lại
  const updatedConv = manager.getConversations().find(c => c.conversationId === "conv-b");
  assert.equal(updatedConv.lastMessage.content, "Realtime hello from B!");
  assert.equal(updatedConv.lastMessageAt, "2026-07-20T12:00:00Z");

  manager.cleanup();
});

test("SidebarStateManager markConversationRead clears unread count and sets lastMessage.isRead", async () => {
  mockLocalStorage.clear();
  const initialConversations = [
    {
      conversationId: "conv-unread-1",
      kind: "direct",
      unreadCount: 3,
      lastMessageAt: "2026-07-20T08:00:00.000Z",
      lastMessage: { content: "Unread message", createdAt: "2026-07-20T08:00:00.000Z", isRead: false },
      target: { _id: "user-target-1", displayName: "User Target" }
    }
  ];

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false })
  });

  await manager.init();
  assert.equal(manager.getConversations()[0].unreadCount, 3);

  // Call markConversationRead by target._id
  manager.markConversationRead("user-target-1");

  const conv = manager.getConversations()[0];
  assert.equal(conv.unreadCount, 0);
  assert.equal(conv.lastMessage.isRead, true);

  manager.cleanup();
});

test("SidebarStateManager removeConversation removes target conversation from state", async () => {
  mockLocalStorage.clear();
  const initialConversations = [
    {
      conversationId: "conv-delete-1",
      kind: "direct",
      unreadCount: 0,
      lastMessageAt: "2026-07-20T08:00:00.000Z",
      target: { _id: "user-target-1", displayName: "User Target" }
    },
    {
      conversationId: "conv-keep-2",
      kind: "direct",
      unreadCount: 0,
      lastMessageAt: "2026-07-20T07:00:00.000Z",
      target: { _id: "user-target-2", displayName: "User Keep" }
    }
  ];

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false })
  });

  await manager.init();
  assert.equal(manager.getConversations().length, 2);

  // Remove conversation by conversationId or target._id
  manager.removeConversation("conv-delete-1");

  assert.equal(manager.getConversations().length, 1);
  assert.equal(manager.getConversations()[0].conversationId, "conv-keep-2");

  manager.cleanup();
});

test("SidebarStateManager clearHistory hides conversation from default list but shows in search", async () => {
  mockLocalStorage.clear();
  const initialConversations = [
    {
      conversationId: "conv-group-1",
      kind: "group",
      unreadCount: 0,
      lastMessageAt: "2026-07-20T08:00:00.000Z",
      lastMessage: { content: "Old group message" },
      target: { _id: "group-1", displayName: "Group Alpha" }
    }
  ];

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: initialConversations, nextCursor: null, hasMore: false })
  });

  await manager.init();
  assert.equal(manager.getDisplayedConversations().length, 1);

  // Clear history for group-1
  manager.clearHistory("group-1");

  // In default view (search is empty), conversation with no lastMessage is hidden
  assert.equal(manager.getDisplayedConversations().length, 0);

  // In search view (searchTerm typed), conversation appears in search results
  manager.setSearchTerm("Alpha");
  assert.equal(manager.getDisplayedConversations().length, 1);
  assert.equal(manager.getDisplayedConversations()[0].target.displayName, "Group Alpha");

  manager.cleanup();
});

test("SidebarStateManager setFilter preserves searchTerm and passes q to fetch API when search is active", async () => {
  mockLocalStorage.clear();
  let lastParams = null;

  const mockFetch = async (params) => {
    lastParams = params;
    if (params.q === "Group A" && params.kind === "group") {
      return {
        success: true,
        conversations: [{
          conversationId: "conv-g1",
          kind: "group",
          target: { displayName: "Group A" }
        }],
        nextCursor: null,
        hasMore: false
      };
    }
    return { success: true, conversations: [], nextCursor: null, hasMore: false };
  };

  const manager = new SidebarStateManager({
    fetchConversationsApi: mockFetch
  });

  await manager.init();

  // Type search term
  manager.setSearchTerm("Group A");
  assert.equal(manager.getSearchTerm(), "Group A");

  // Switch filter tab to "group"
  await manager.setFilter("group");

  assert.equal(lastParams.kind, "group");
  assert.equal(lastParams.q, "Group A");
  assert.equal(manager.getDisplayedConversations().length, 1);
  assert.equal(manager.getDisplayedConversations()[0].target.displayName, "Group A");

  manager.cleanup();
});

test("SidebarStateManager handleSocketMessage for group message uses group avatar, not sender avatar", async () => {
  mockLocalStorage.clear();

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: [], nextCursor: null, hasMore: false })
  });

  await manager.init();

  // Incoming socket message for group from User A
  const groupSocketMessage = {
    _id: "msg-group-100",
    conversationId: "conv-group-100",
    senderId: "user-a",
    sender: { _id: "user-a", displayName: "User A", avatar: "http://example.com/user-a-avatar.jpg" },
    receiverId: "group-100",
    isGroup: true,
    groupName: "Design Team",
    groupAvatar: "http://example.com/group-avatar.jpg",
    text: "Hello team!",
    createdAt: "2026-07-22T12:00:00Z"
  };

  manager.handleSocketMessage(groupSocketMessage, { activeChat: null, currentUserId: "user-b" });

  const convs = manager.getConversations();
  assert.equal(convs.length, 1);
  assert.equal(convs[0].kind, "group");
  assert.equal(convs[0].target.displayName, "Design Team");
  assert.equal(convs[0].target.avatar, "http://example.com/group-avatar.jpg");
  assert.notEqual(convs[0].target.avatar, "http://example.com/user-a-avatar.jpg");

  manager.cleanup();
});

test("SidebarStateManager setSearchTerm clearing term refetches default conversations list for active tab", async () => {
  mockLocalStorage.clear();

  let lastParams = null;

  const mockFetch = async (params) => {
    lastParams = params;
    if (params.q === "B") {
      return { success: true, conversations: [], nextCursor: null, hasMore: false };
    }
    return {
      success: true,
      conversations: [{ conversationId: "conv-aloo", kind: "group", lastMessage: { content: "hi" }, target: { displayName: "ALOO" } }],
      nextCursor: null,
      hasMore: false
    };
  };

  const manager = new SidebarStateManager({
    fetchConversationsApi: mockFetch
  });

  await manager.init();

  // Search "B"
  manager.setSearchTerm("B");
  await manager.fetchSearchData("B");

  assert.equal(manager.getDisplayedConversations().length, 0);

  // Clear search term "B" -> ""
  manager.setSearchTerm("");

  // Wait for async fetchData
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(lastParams.q, undefined);
  assert.equal(manager.getDisplayedConversations().length, 1);
  assert.equal(manager.getDisplayedConversations()[0].target.displayName, "ALOO");

  manager.cleanup();
});

test("SidebarStateManager fetchSearchData updates existing conversations target data with fresh search results", async () => {
  mockLocalStorage.clear();

  const manager = new SidebarStateManager({
    fetchConversationsApi: async (params) => {
      if (params.q === "A") {
        return {
          success: true,
          conversations: [{
            conversationId: "conv-a",
            kind: "direct",
            target: { _id: "user-a", displayName: "A", isOnline: true }
          }],
          nextCursor: null,
          hasMore: false
        };
      }
      return {
        success: true,
        conversations: [{
          conversationId: "conv-a",
          kind: "direct",
          lastMessage: null,
          target: { _id: "user-a", displayName: "A", isOnline: false }
        }],
        nextCursor: null,
        hasMore: false
      };
    }
  });

  await manager.init();

  // Clear history on conv-a
  manager.clearHistory("conv-a");
  assert.equal(manager.getConversations()[0].target.isOnline, false);

  // Search "A"
  await manager.fetchSearchData("A");

  // target.isOnline must be updated to true from search results
  assert.equal(manager.getConversations()[0].target.isOnline, true);

  manager.cleanup();
});
