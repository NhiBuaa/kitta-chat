import { useState, useEffect, useCallback } from "react";
import { getSidebarConversations, searchSidebarUsers } from "../../../services/api/sidebarApi.js";

export class SidebarStateManager {
  constructor({ fetchConversationsApi, fetchUsersApi, onStateChange } = {}) {
    this.fetchConversationsApi = fetchConversationsApi || getSidebarConversations;
    this.fetchUsersApi = fetchUsersApi || searchSidebarUsers;
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
    this.searchTimer = null;
    this.searchRequestId = 0;
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
    this.searchRequestId += 1;
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
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
    const trimmedSearchTerm = this.searchTerm.trim();
    if (trimmedSearchTerm) {
      return this.fetchSearchData(trimmedSearchTerm);
    }
    return this.fetchData(this.abortController.signal);
  }

  // Cập nhật từ khóa tìm kiếm
  setSearchTerm(term) {
    const prevTrimmed = this.searchTerm ? this.searchTerm.trim() : "";
    const trimmed = term ? term.trim() : "";

    this.searchTerm = term || "";
    this.searchRequestId += 1;

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }

    if (!trimmed) {
      this.conversations = this.conversations.filter(
        (conversation) => !conversation.isGlobalUserSearchResult,
      );
    }
    this.onStateChange();

    if (trimmed.length > 0) {
      this.searchTimer = setTimeout(() => {
        this.fetchSearchData(trimmed);
      }, 300);
    } else if (prevTrimmed.length > 0) {
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
    const requestId = ++this.searchRequestId;
    const shouldSearchUsers = this.activeFilter !== "group";
    this.isFetching = true;
    this.onStateChange();

    try {
      const params = { q: term, limit: 30 };
      if (this.activeFilter === "direct") params.kind = "direct";
      else if (this.activeFilter === "group") params.kind = "group";

      const [conversationResponse, userResponse] = await Promise.all([
        this.fetchConversationsApi(params).catch(() => ({
          success: false,
          conversations: [],
        })),
        shouldSearchUsers
          ? this.fetchUsersApi(term).catch(() => ({
              data: { success: false, users: [] },
            }))
          : Promise.resolve({ data: { success: true, users: [] } }),
      ]);

      if (requestId !== this.searchRequestId) {
        return;
      }

      const conversationData = conversationResponse?.data?.conversations
        ? conversationResponse.data
        : (conversationResponse?.conversations
          ? conversationResponse
          : (conversationResponse?.data || conversationResponse));
      const searchConversations = conversationData?.conversations ||
        (Array.isArray(conversationData) ? conversationData : []);
      const userData = userResponse?.data?.users
        ? userResponse.data
        : (userResponse?.users ? userResponse : (userResponse?.data || userResponse));
      const globalUsers = Array.isArray(userData?.users) ? userData.users : [];

      const normalizedSearchTerm = term.toLowerCase().trim();
      const mergedConversations = this.conversations
        .filter((conversation) => !conversation.isGlobalUserSearchResult)
        .map((conversation) => {
          if (!conversation.globalUserSearchMatchTerm) return conversation;
          const { globalUserSearchMatchTerm: _ignored, ...rest } = conversation;
          return rest;
        });
      const conversationById = new Map(
        mergedConversations.map((conversation) => [
          conversation.conversationId || conversation._id,
          conversation,
        ]),
      );

      searchConversations.forEach((searchConversation) => {
        const conversationId = searchConversation.conversationId || searchConversation._id;
        if (conversationById.has(conversationId)) {
          const existingConversation = conversationById.get(conversationId);
          existingConversation.target = {
            ...existingConversation.target,
            ...searchConversation.target,
          };
          if (searchConversation.legacyConversationId) {
            existingConversation.legacyConversationId = searchConversation.legacyConversationId;
          }
        } else {
          mergedConversations.push(searchConversation);
          conversationById.set(conversationId, searchConversation);
        }
      });

      const conversationByTargetId = new Map();
      mergedConversations.forEach((conversation) => {
        const targetId = conversation.target?._id || conversation.target?.id;
        if (targetId) conversationByTargetId.set(String(targetId), conversation);
      });

      globalUsers.forEach((user) => {
        if (!user?._id) return;
        const targetId = String(user._id);
        const existingConversation = conversationByTargetId.get(targetId);
        if (existingConversation) {
          existingConversation.target = {
            ...existingConversation.target,
            ...user,
          };
          existingConversation.globalUserSearchMatchTerm = normalizedSearchTerm;
          return;
        }

        const searchResultConversation = {
          _id: `user-search:${targetId}`,
          kind: "direct",
          target: user,
          lastMessage: null,
          lastMessageAt: null,
          unreadCount: 0,
          hasUnread: false,
          isPinned: false,
          isGlobalUserSearchResult: true,
          globalUserSearchMatchTerm: normalizedSearchTerm,
        };
        mergedConversations.push(searchResultConversation);
        conversationByTargetId.set(targetId, searchResultConversation);
      });

      this.conversations = mergedConversations;
      this.onStateChange();
    } catch (err) {
      console.error("[SidebarStateManager] Fetch search data error:", err);
    } finally {
      if (requestId === this.searchRequestId) {
        this.isFetching = false;
        this.onStateChange();
      }
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
        const matchesGlobalUserSearch = conv.globalUserSearchMatchTerm === term;
        if (!displayName.includes(term) && !matchesGlobalUserSearch) {
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

    const equalsId = (a, b) => Boolean(a && b && String(a) === String(b));

    const senderId = data.senderId || data.sender?._id || data.sender;
    const receiverId = data.receiverId || data.receiver?._id || data.receiver;
    const isMeSender = equalsId(senderId, currentUserId);
    const isGroup = Boolean(data.isGroup);

    const incomingConvId = data.conversationId || data._id;
    const incomingTargetId = isGroup ? receiverId : (isMeSender ? receiverId : senderId);

    let conv = this.conversations.find((c) => {
      if (incomingConvId && (equalsId(c.conversationId, incomingConvId) || equalsId(c.legacyConversationId, incomingConvId) || equalsId(c._id, incomingConvId))) {
        return true;
      }
      if (c.target && (equalsId(c.target._id, incomingTargetId) || equalsId(c.target.id, incomingTargetId))) {
        return true;
      }
      return false;
    });

    const createdAt = data.createdAt || new Date().toISOString();
    let content = data.text || data.content || "";
    if (!content.trim()) {
      if (data.type === "call_log" || data.callData) {
        content = data.callData?.status === "missed" ? "[Cuộc gọi nhỡ]" : (data.callData?.type === "audio" ? "[Cuộc gọi thoại]" : "[Cuộc gọi video]");
      } else {
        const atts = Array.isArray(data.attachmentsData) && data.attachmentsData.length > 0
          ? data.attachmentsData
          : (Array.isArray(data.attachments) && data.attachments.length > 0
            ? data.attachments
            : (Array.isArray(data.files) ? data.files : []));

        const firstAtt = atts[0];
        const mime = (typeof firstAtt === "object" ? (firstAtt?.mimeType || firstAtt?.type || "") : "") || data.mimeType || "";

        if (mime.startsWith("image/") || data.type === "image" || data.image) {
          content = "[Hình ảnh]";
        } else if (mime.startsWith("video/") || data.type === "video") {
          content = "[Video]";
        } else if (mime.startsWith("audio/") || data.type === "audio") {
          content = "[Tệp âm thanh]";
        } else if (atts.length > 0 || data.type === "file" || data.file) {
          content = "[Tệp tin]";
        }
      }
    }
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
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchRequestId += 1;
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
