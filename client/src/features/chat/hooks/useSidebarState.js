import { useState, useEffect, useRef, useCallback } from "react";
import { getSidebarConversations } from "../../../services/api/sidebarApi.js";

export class SidebarStateManager {
  constructor({ fetchConversationsApi, onStateChange } = {}) {
    this.fetchConversationsApi = fetchConversationsApi || getSidebarConversations;
    this.onStateChange = onStateChange || (() => {});

    // Khôi phục preference từ localStorage
    const savedFilter = localStorage.getItem("kitta_sidebar_filter");
    this.activeFilter = (savedFilter === "direct" || savedFilter === "group") ? savedFilter : "all";

    this.searchTerm = "";
    this.conversations = [];
    this.cursor = null;
    this.hasMore = true;
    this.isFetching = false;

    this.abortController = null;
    this.reorderTimer = null;
  }

  getActiveFilter() {
    return this.activeFilter;
  }

  getSearchTerm() {
    return this.searchTerm;
  }

  getConversations() {
    return this.conversations;
  }

  getCursor() {
    return this.cursor;
  }

  getHasMore() {
    return this.hasMore;
  }

  getIsFetching() {
    return this.isFetching;
  }

  setFilterStateOnly(filter) {
    this.activeFilter = filter;
  }

  // Tải dữ liệu ban đầu
  async init() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    this.cursor = null;
    return this.fetchData(this.abortController.signal);
  }

  // Đổi tab filter
  async setFilter(newFilter) {
    // 1. Abort request cũ
    if (this.abortController) {
      this.abortController.abort();
    }

    // 2. Reset state lập tức trước khi request mới gửi đi
    this.conversations = [];
    this.cursor = null;
    this.hasMore = true;
    this.activeFilter = newFilter;
    
    // Lưu preference
    localStorage.setItem("kitta_sidebar_filter", newFilter);
    this.onStateChange();

    // 3. Tạo AbortController mới
    this.abortController = new AbortController();

    // 4. Gọi fetch trang đầu
    return this.fetchData(this.abortController.signal);
  }

  // Cập nhật từ khóa tìm kiếm
  setSearchTerm(term) {
    const prevTrimmed = this.searchTerm ? this.searchTerm.trim() : "";
    this.searchTerm = term;
    this.onStateChange();

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    const trimmed = term ? term.trim() : "";

    if (trimmed.length > 0) {
      this.searchTimer = setTimeout(() => {
        this.fetchSearchData(trimmed);
      }, 300);
    } else if (prevTrimmed.length > 0) {
      // Khi từ khóa được xoá về rỗng "", reset danh sách và nạp lại dữ liệu mặc định của tab hiện tại
      this.cursor = null;
      this.conversations = [];
      this.hasMore = true;
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();
      this.fetchData(this.abortController.signal);
    }
  }

  async fetchSearchData(term) {
    try {
      const params = { q: term, limit: 30 };
      if (this.activeFilter === "direct") params.kind = "direct";
      else if (this.activeFilter === "group") params.kind = "group";

      const res = await this.fetchConversationsApi(params);
      const data = res?.data?.conversations ? res.data : (res?.conversations ? res : (res?.data || res));
      const searchConvs = data?.conversations || (Array.isArray(data) ? data : []);

      if (searchConvs.length > 0) {
        const convMap = new Map(this.conversations.map(c => [c.conversationId || c._id, c]));
        searchConvs.forEach(sc => {
          const id = sc.conversationId || sc._id;
          if (convMap.has(id)) {
            const existing = convMap.get(id);
            existing.target = { ...existing.target, ...sc.target };
            if (sc.legacyConversationId) existing.legacyConversationId = sc.legacyConversationId;
          } else {
            this.conversations.push(sc);
          }
        });
        this.onStateChange();
      }
    } catch (err) {
      console.error("[SidebarStateManager] Fetch search data error:", err);
    }
  }

  // Fetch dữ liệu thực tế từ API
  async fetchData(signal) {
    this.isFetching = true;
    this.onStateChange();

    try {
      const params = {
        limit: 20,
        cursor: this.cursor || undefined,
      };

      if (this.activeFilter === "direct") {
        params.kind = "direct";
      } else if (this.activeFilter === "group") {
        params.kind = "group";
      }

      if (this.searchTerm && this.searchTerm.trim()) {
        params.q = this.searchTerm.trim();
      }

      const res = await this.fetchConversationsApi(params, { signal });
      
      if (signal && signal.aborted) {
        return;
      }

      const data = res?.data?.conversations ? res.data : (res?.conversations ? res : (res?.data || res));
      if (data && (data.success || Array.isArray(data.conversations) || Array.isArray(data))) {
        const newConvs = data.conversations || (Array.isArray(data) ? data : []);
        
        // Append dữ liệu
        if (this.cursor === null) {
          this.conversations = newConvs;
        } else {
          // Tránh trùng lặp
          const existingIds = new Set(this.conversations.map(c => c.conversationId || c._id));
          const filteredNewConvs = newConvs.filter(c => !existingIds.has(c.conversationId || c._id));
          this.conversations = [...this.conversations, ...filteredNewConvs];
        }

        this.cursor = data.nextCursor || null;
        this.hasMore = data.hasMore !== undefined ? data.hasMore : (newConvs.length >= 20);
      }
    } catch (err) {
      if (err.name === "AbortError" || err.message === "canceled") {
        return;
      }
      console.error("[SidebarStateManager] Fetch data error:", err);
    } finally {
      this.isFetching = false;
      this.onStateChange();
    }
  }

  // Load more trang tiếp theo
  async loadMore() {
    if (this.isFetching || !this.hasMore) return;
    
    const signal = this.abortController ? this.abortController.signal : undefined;
    return this.fetchData(signal);
  }

  // Logic lọc kết hợp AND (Filter Chip + Search Input)
  getDisplayedConversations() {
    const hasSearch = Boolean(this.searchTerm.trim());

    return this.conversations.filter((conv) => {
      // 1. Ở chế độ xem mặc định (không search), ẩn các cuộc trò chuyện chưa ghim và không có tin nhắn
      if (!hasSearch) {
        if (!conv.isPinned && !conv.lastMessage) {
          return false;
        }
      }

      // 2. Lọc theo Tab Filter (kind)
      if (this.activeFilter === "direct" && conv.kind !== "direct") {
        return false;
      }
      if (this.activeFilter === "group" && conv.kind !== "group") {
        return false;
      }

      // 3. Lọc theo Search Term (AND logic)
      if (hasSearch) {
        const term = this.searchTerm.toLowerCase().trim();
        const displayName = (conv.target?.displayName || "").toLowerCase();
        if (!displayName.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }

  // Sắp xếp lại danh sách conversations (isPinned lên trước, sau đó theo lastMessageAt giảm dần, tie-breaker bằng ID)
  sortConversations() {
    this.conversations.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      const timeA = new Date(a.lastMessageAt || 0).getTime();
      const timeB = new Date(b.lastMessageAt || 0).getTime();
      if (timeA !== timeB) {
        return timeB - timeA;
      }

      const idA = String(a.conversationId || a._id || "");
      const idB = String(b.conversationId || b._id || "");
      return idB.localeCompare(idA);
    });
  }

  // Xử lý sự kiện tin nhắn mới từ socket real-time
  handleSocketMessage(data, { activeChat, currentUserId, socket, debounceMs = 300 } = {}) {
    if (!data) return;

    const senderId = data.senderId || data.sender?._id || data.sender;
    const receiverId = data.receiverId || data.receiver?._id || data.receiver;
    const isMeSender = senderId === currentUserId;
    const isGroup = Boolean(data.isGroup);

    const incomingConvId = data.conversationId || data._id;
    const incomingTargetId = isGroup ? receiverId : (isMeSender ? receiverId : senderId);

    let conv = this.conversations.find((c) => {
      if (incomingConvId && (c.conversationId === incomingConvId || c.legacyConversationId === incomingConvId || c._id === incomingConvId)) {
        return true;
      }
      if (c.target && (c.target._id === incomingTargetId || c.target.id === incomingTargetId)) {
        return true;
      }
      return false;
    });

    const createdAt = data.createdAt || new Date().toISOString();
    const content = data.text || data.content || (data.image ? "[Hình ảnh]" : (data.file ? "[Tệp tin]" : ""));
    const senderName = data.sender?.displayName || data.senderName || "";
    const senderAvatar = data.sender?.avatar || data.senderAvatar || "";

    const lastMessageObj = {
      senderId,
      senderName,
      senderAvatar,
      content,
      createdAt,
      messageId: data._id || data.messageId
    };

    const isActiveChat = activeChat && (
      (activeChat.conversationId && (activeChat.conversationId === incomingConvId || activeChat.conversationId === conv?.conversationId)) ||
      (activeChat._id && (activeChat._id === incomingConvId || activeChat._id === conv?.conversationId || activeChat._id === incomingTargetId || activeChat._id === conv?.target?._id)) ||
      (activeChat.receiverId && (activeChat.receiverId === incomingTargetId || activeChat.receiverId === conv?.target?._id))
    );

    if (conv) {
      // 1. Cập nhật xem trước nội dung lập tức (Instant Preview Update)
      conv.lastMessageAt = createdAt;
      conv.lastMessage = lastMessageObj;

      // 2. Cập nhật Unread Count & Active Chat Guard
      if (!isMeSender) {
        if (isActiveChat) {
          if (socket && typeof socket.emit === "function") {
            if (isGroup) {
              socket.emit("markRead", { isGroup: true, groupId: incomingTargetId, readerId: currentUserId });
            } else {
              socket.emit("markRead", { senderId, receiverId: currentUserId });
            }
          }
        } else {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
      }
    } else {
      // 3. New conversation ingestion qua socket
      const targetObj = data.target || {
        _id: incomingTargetId,
        displayName: isGroup ? (data.groupName || "Nhóm chat") : (senderName || "Người dùng"),
        avatar: isGroup ? (data.groupAvatar || data.group?.avatar || "") : senderAvatar
      };

      const newConv = {
        conversationId: incomingConvId || `conv-${Date.now()}`,
        legacyConversationId: data.legacyConversationId || undefined,
        kind: isGroup ? "group" : "direct",
        isPinned: false,
        isMuted: false,
        unreadCount: (isMeSender || isActiveChat) ? 0 : 1,
        lastMessageAt: createdAt,
        lastMessage: lastMessageObj,
        target: targetObj
      };

      this.conversations = [newConv, ...this.conversations];
    }

    // Phát tín hiệu cập nhật UI tức thì cho tin nhắn mới (Instant UI Update)
    this.onStateChange();

    // 4. Debounced UI Sorting (300-500ms delay cho việc thay đổi thứ tự hàng)
    if (this.reorderTimer) {
      clearTimeout(this.reorderTimer);
    }

    this.reorderTimer = setTimeout(() => {
      this.reorderTimer = null;
      this.sortConversations();
      this.onStateChange();
    }, debounceMs);
  }

  markConversationRead(targetIdOrConvId) {
    if (!targetIdOrConvId) return;

    let updated = false;
    for (const conv of this.conversations) {
      const matchId = (
        conv.conversationId === targetIdOrConvId ||
        conv.legacyConversationId === targetIdOrConvId ||
        conv._id === targetIdOrConvId ||
        (conv.target && (conv.target._id === targetIdOrConvId || conv.target.id === targetIdOrConvId))
      );

      if (matchId) {
        if (conv.unreadCount > 0 || (conv.lastMessage && !conv.lastMessage.isRead)) {
          conv.unreadCount = 0;
          if (conv.lastMessage) {
            conv.lastMessage.isRead = true;
          }
          updated = true;
        }
      }
    }

    if (updated) {
      this.onStateChange();
    }
  }

  removeConversation(targetIdOrConvId) {
    if (!targetIdOrConvId) return;

    const initialLength = this.conversations.length;
    this.conversations = this.conversations.filter((conv) => {
      const matchId =
        conv.conversationId === targetIdOrConvId ||
        conv.legacyConversationId === targetIdOrConvId ||
        conv._id === targetIdOrConvId ||
        (conv.target &&
          (conv.target._id === targetIdOrConvId ||
            conv.target.id === targetIdOrConvId));
      return !matchId;
    });

    if (this.conversations.length !== initialLength) {
      this.onStateChange();
    }
  }

  clearHistory(targetIdOrConvId) {
    if (!targetIdOrConvId) return;

    let updated = false;
    for (const conv of this.conversations) {
      const matchId =
        conv.conversationId === targetIdOrConvId ||
        conv.legacyConversationId === targetIdOrConvId ||
        conv._id === targetIdOrConvId ||
        (conv.target &&
          (conv.target._id === targetIdOrConvId ||
            conv.target.id === targetIdOrConvId));

      if (matchId) {
        conv.lastMessage = null;
        conv.lastMessageAt = null;
        conv.unreadCount = 0;
        updated = true;
      }
    }

    if (updated) {
      this.onStateChange();
    }
  }

  cleanup() {
    if (this.reorderTimer) {
      clearTimeout(this.reorderTimer);
      this.reorderTimer = null;
    }
  }
}

export function useSidebarState(options = {}) {
  const { enabled = true } = options;
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Tạo và giữ instance duy nhất của state manager thông qua useState initializer
  const [manager] = useState(
    () =>
      new SidebarStateManager({
        onStateChange: forceUpdate,
      }),
  );

  // Giữ manager.onStateChange luôn được cập nhật
  manager.onStateChange = forceUpdate;

  // Gọi init ở lần render đầu tiên khi enabled === true
  useEffect(() => {
    if (!enabled) return;

    manager.init();
    return () => {
      if (manager.abortController) {
        manager.abortController.abort();
      }
      manager.cleanup();
    };
  }, [manager, enabled]);

  return {
    activeFilter: manager.getActiveFilter(),
    setActiveFilter: (filter) => manager.setFilter(filter),
    searchTerm: manager.getSearchTerm(),
    setSearchTerm: (term) => manager.setSearchTerm(term),
    conversations: manager.getDisplayedConversations(),
    onLoadMore: () => manager.loadMore(),
    hasMore: manager.getHasMore(),
    isFetching: manager.getIsFetching(),
    handleSocketMessage: (data, opts) =>
      manager.handleSocketMessage(data, opts),
    markConversationRead: (targetIdOrConvId) =>
      manager.markConversationRead(targetIdOrConvId),
    removeConversation: (targetIdOrConvId) =>
      manager.removeConversation(targetIdOrConvId),
    clearHistory: (targetIdOrConvId) =>
      manager.clearHistory(targetIdOrConvId),
    init: () => manager.init(),
    manager,
  };
}
