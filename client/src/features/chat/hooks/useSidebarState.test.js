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

test("SidebarStateManager initialization restores active filter from localStorage", () => {
  mockLocalStorage.clear();
  mockLocalStorage.setItem("kitta_sidebar_filter", "group");

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ conversations: [], nextCursor: null, hasMore: false })
  });

  assert.equal(manager.getActiveFilter(), "group");
});

test("SidebarStateManager initialization defaults to 'all' if localStorage is empty", () => {
  mockLocalStorage.clear();

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ conversations: [], nextCursor: null, hasMore: false })
  });

  assert.equal(manager.getActiveFilter(), "all");
});

test("SidebarStateManager switching tab resets cursor, clears list, sets localStorage, and fetches new data", async () => {
  mockLocalStorage.clear();
  let fetchCount = 0;
  let lastFetchKind = null;

  const mockFetch = async (params) => {
    fetchCount++;
    lastFetchKind = params.kind;
    return {
      success: true,
      conversations: [{ id: `${params.kind}-1`, lastMessageAt: new Date().toISOString() }],
      nextCursor: `cursor-${params.kind}`,
      hasMore: false
    };
  };

  const manager = new SidebarStateManager({
    fetchConversationsApi: mockFetch
  });

  // Initial fetch on creation (filter = "all", kind = "")
  await manager.init();
  assert.equal(fetchCount, 1);
  assert.equal(lastFetchKind, undefined);
  assert.equal(manager.getConversations().length, 1);

  // Switch to "direct"
  const switchPromise = manager.setFilter("direct");
  
  // States must be cleared instantly (before resolve)
  assert.equal(manager.getConversations().length, 0);
  assert.equal(manager.getCursor(), null);
  assert.equal(mockLocalStorage.getItem("kitta_sidebar_filter"), "direct");

  await switchPromise;

  assert.equal(fetchCount, 2);
  assert.equal(lastFetchKind, "direct");
  assert.equal(manager.getConversations().length, 1);
  assert.equal(manager.getCursor(), "cursor-direct");
});

test("SidebarStateManager implements search AND filter chip local filtering logic", async () => {
  const dummyConversations = [
    { id: "1", kind: "direct", lastMessageAt: "2026-07-20T08:00:00Z", target: { displayName: "Alice" } },
    { id: "2", kind: "group", lastMessageAt: "2026-07-20T09:00:00Z", target: { displayName: "Design Group" } },
    { id: "3", kind: "direct", lastMessageAt: "2026-07-20T10:00:00Z", target: { displayName: "Bob" } }
  ];

  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({
      success: true,
      conversations: dummyConversations,
      nextCursor: null,
      hasMore: false
    })
  });

  await manager.init();

  // Test filter "all" and search "al" (Alice)
  manager.setSearchTerm("al");
  let displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].target.displayName, "Alice");

  // Test filter "group" and search "al" -> should be empty (Design Group does not contain "al")
  manager.setFilterStateOnly("group"); // changes activeFilter state without refetching for mock test
  displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 0);

  // Test filter "group" and search "design"
  manager.setSearchTerm("design");
  displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].target.displayName, "Design Group");
});

test("SidebarStateManager prevents race condition on rapid tab switching (out-of-order resolve)", async () => {
  mockLocalStorage.clear();
  const resolvers = [];

  const mockFetch = (params, config) => {
    return new Promise((resolve) => {
      resolvers.push({
        kind: params.kind,
        signal: config?.signal || null,
        resolve,
      });
    });
  };

  const manager = new SidebarStateManager({
    fetchConversationsApi: mockFetch
  });

  // Init fetch (kind=undefined for "all")
  const pInit = manager.init();
  assert.equal(resolvers.length, 1);
  resolvers[0].resolve({ success: true, conversations: [], nextCursor: null, hasMore: false });
  await pInit;

  // User rapidly clicks "group" then "direct"
  const pGroup = manager.setFilter("group");
  // At this point: resolvers[1] is the group request, its signal will be aborted by the next setFilter
  const pDirect = manager.setFilter("direct");
  // resolvers[2] is the direct request

  assert.equal(resolvers.length, 3);
  assert.equal(resolvers[1].kind, "group");
  assert.equal(resolvers[2].kind, "direct");

  // The group signal should be aborted (setFilter("direct") called abort on the previous controller)
  assert.equal(resolvers[1].signal.aborted, true);
  // The direct signal should NOT be aborted
  assert.equal(resolvers[2].signal.aborted, false);

  // Simulate out-of-order response: direct resolves first
  resolvers[2].resolve({
    success: true,
    conversations: [{ id: "direct-1", kind: "direct", target: { displayName: "Alice" } }],
    nextCursor: "c-direct",
    hasMore: false
  });
  await pDirect;

  assert.equal(manager.getActiveFilter(), "direct");
  assert.equal(manager.getConversations().length, 1);
  assert.equal(manager.getConversations()[0].target.displayName, "Alice");

  // Group resolves second (stale response, signal already aborted)
  resolvers[1].resolve({
    success: true,
    conversations: [{ id: "group-1", kind: "group", target: { displayName: "Group A" } }],
    nextCursor: "c-group",
    hasMore: false
  });
  await pGroup;

  // Active filter remains "direct", conversations must NOT be overwritten by stale group results
  assert.equal(manager.getActiveFilter(), "direct");
  assert.equal(manager.getConversations().length, 1);
  assert.equal(manager.getConversations()[0].target.displayName, "Alice");
});



test("SidebarStateManager search includes a non-friend user without an existing conversation", async () => {
  let userSearchCalls = 0;
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({
      success: true,
      conversations: [],
      nextCursor: null,
      hasMore: false,
    }),
    fetchUsersApi: async (keyword) => {
      userSearchCalls += 1;
      assert.equal(keyword, "alice");
      return {
        data: {
          success: true,
          users: [
            {
              _id: "user-alice",
              displayName: "Alice Stranger",
              isFriend: false,
              isSent: false,
              isReceived: false,
            },
          ],
        },
      };
    },
  });

  manager.searchTerm = "alice";
  await manager.fetchSearchData("alice");

  const displayed = manager.getDisplayedConversations();
  assert.equal(userSearchCalls, 1);
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].kind, "direct");
  assert.equal(displayed[0].target._id, "user-alice");
  assert.equal(displayed[0].target.isFriend, false);
  assert.equal(displayed[0].isGlobalUserSearchResult, true);
});

test("SidebarStateManager preserves users matched by server email search", async () => {
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({
      success: true,
      conversations: [],
    }),
    fetchUsersApi: async () => ({
      data: {
        success: true,
        users: [{
          _id: "user-alice",
          displayName: "Alice Stranger",
          isFriend: false,
        }],
      },
    }),
  });

  manager.searchTerm = "alice@example.com";
  await manager.fetchSearchData("alice@example.com");

  const displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].target._id, "user-alice");
});

test("SidebarStateManager search dedupes a global user against an existing conversation", async () => {
  const existingConversation = {
    conversationId: "conv-alice",
    kind: "direct",
    target: { _id: "user-alice", displayName: "Alice" },
  };
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({
      success: true,
      conversations: [existingConversation],
      nextCursor: null,
      hasMore: false,
    }),
    fetchUsersApi: async () => ({
      data: {
        success: true,
        users: [{ _id: "user-alice", displayName: "Alice", isFriend: true }],
      },
    }),
  });

  manager.searchTerm = "alice";
  await manager.fetchSearchData("alice");

  const matchingRows = manager
    .getDisplayedConversations()
    .filter((conversation) => conversation.target?._id === "user-alice");
  assert.equal(matchingRows.length, 1);
  assert.equal(matchingRows[0].conversationId, "conv-alice");
  assert.equal(matchingRows[0].target.isFriend, true);
});

test("SidebarStateManager keeps conversation search results when global user search fails", async () => {
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({
      success: true,
      conversations: [{
        conversationId: "conv-alice",
        kind: "direct",
        target: { _id: "user-alice", displayName: "Alice", isOnline: true },
      }],
    }),
    fetchUsersApi: async () => {
      throw new Error("user search unavailable");
    },
  });

  manager.searchTerm = "alice";
  await manager.fetchSearchData("alice");

  const displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].conversationId, "conv-alice");
  assert.equal(displayed[0].target.isOnline, true);
});

test("SidebarStateManager keeps global user results when conversation search fails", async () => {
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => {
      throw new Error("conversation search unavailable");
    },
    fetchUsersApi: async () => ({
      data: {
        success: true,
        users: [{
          _id: "user-alice",
          displayName: "Alice Stranger",
          isFriend: false,
        }],
      },
    }),
  });

  manager.searchTerm = "alice";
  await manager.fetchSearchData("alice");

  const displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].target._id, "user-alice");
  assert.equal(displayed[0].isGlobalUserSearchResult, true);
});

test("SidebarStateManager filter change rejects an older search response", async () => {
  let resolveOldConversationSearch;
  const manager = new SidebarStateManager({
    fetchConversationsApi: async (params) => {
      if (params.kind === "group") {
        return {
          success: true,
          conversations: [{
            conversationId: "group-design",
            kind: "group",
            target: { _id: "group-design", displayName: "Design Team" },
          }],
        };
      }
      return new Promise((resolve) => {
        resolveOldConversationSearch = resolve;
      });
    },
    fetchUsersApi: async () => ({ data: { success: true, users: [] } }),
  });

  manager.searchTerm = "design";
  const oldSearch = manager.fetchSearchData("design");
  await Promise.resolve();
  await manager.setFilter("group");

  resolveOldConversationSearch({
    success: true,
    conversations: [{
      conversationId: "direct-design",
      kind: "direct",
      target: { _id: "user-design", displayName: "Design Person" },
    }],
  });
  await oldSearch;

  const displayed = manager.getDisplayedConversations();
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].conversationId, "group-design");
  assert.equal(displayed[0].kind, "group");
});

test("SidebarStateManager group search does not request global users", async () => {
  let userSearchCalls = 0;
  const manager = new SidebarStateManager({
    fetchConversationsApi: async () => ({ success: true, conversations: [] }),
    fetchUsersApi: async () => {
      userSearchCalls += 1;
      return { data: { success: true, users: [] } };
    },
  });

  manager.setFilterStateOnly("group");
  manager.searchTerm = "design";
  await manager.fetchSearchData("design");

  assert.equal(userSearchCalls, 0);
});
