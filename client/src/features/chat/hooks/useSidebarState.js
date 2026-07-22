import { useState, useEffect, useRef } from "react";
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
    return this.fetchData();
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
    this.searchTerm = term;
    this.onStateChange();
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

      const res = await this.fetchConversationsApi(params, { signal });
      
      // Nếu signal đã bị abort, axios/fetch tự động ném ra lỗi AbortError và nhảy xuống catch
      
      // Kiểm tra race condition: nếu filter đã bị đổi trong lúc request này pending, bỏ qua
      if (signal && signal.aborted) {
        return;
      }

      const data = res.data || res;
      if (data && (data.success || data.conversations)) {
        const newConvs = data.conversations || [];
        
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
        // Nuốt lỗi abort an toàn
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
    return this.conversations.filter(conv => {
      // 1. Lọc theo Tab Filter (kind)
      if (this.activeFilter === "direct" && conv.kind !== "direct") {
        return false;
      }
      if (this.activeFilter === "group" && conv.kind !== "group") {
        return false;
      }

      // 2. Lọc theo Search Term (AND logic)
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        const displayName = (conv.target?.displayName || "").toLowerCase();
        if (!displayName.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }
}

export function useSidebarState() {
  const [, setTick] = useState(0);
  const forceUpdate = () => setTick(t => t + 1);

  // Tạo và giữ instance duy nhất của state manager
  const managerRef = useRef(null);
  if (!managerRef.current) {
    managerRef.current = new SidebarStateManager({
      onStateChange: forceUpdate
    });
  }
  const manager = managerRef.current;

  // Gọi init ở lần render đầu tiên
  useEffect(() => {
    manager.init();
    return () => {
      if (manager.abortController) {
        manager.abortController.abort();
      }
    };
  }, [manager]);

  return {
    activeFilter: manager.getActiveFilter(),
    setActiveFilter: (filter) => manager.setFilter(filter),
    searchTerm: manager.getSearchTerm(),
    setSearchTerm: (term) => manager.setSearchTerm(term),
    conversations: manager.getDisplayedConversations(),
    onLoadMore: () => manager.loadMore(),
    hasMore: manager.getHasMore(),
    isFetching: manager.getIsFetching()
  };
}
