import React, { useState, useEffect, useRef } from "react";
import { FaLink, FaExternalLinkAlt, FaSync } from "react-icons/fa";
import { getPanelResources } from "@/services/api/conversationPanelApi.js";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll.js";
import { useExplorerFreshness } from "../hooks/useExplorerFreshness.js";

/**
 * LinksExplorer
 * Component hiển thị danh sách liên kết lịch sử chia sẻ phân trang vô hạn,
 * hỗ trợ Freshness Banner realtime và chuyển hướng mở tab mới.
 */
export const LinksExplorer = ({
  conversationId,
  scrollRef,
  socket,
  currentUserId,
}) => {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  // Gọi API lấy tài nguyên links
  const fetchLinksData = async (cursor = null, isReset = false) => {
    // Stale Response Protection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsFetching(true);
    setError(null);

    try {
      const response = await getPanelResources(conversationId, "links", cursor, {
        signal: controller.signal,
      });

      const linksData = response.data?.resourcesPreview?.links;
      if (linksData) {
        if (linksData.status === "error") {
          throw new Error("API returned error status");
        }

        const newItems = linksData.items || [];
        
        setItems((prev) => {
          const merged = isReset ? newItems : [...prev, ...newItems];
          // Cursor Deduplication: Lọc bỏ trùng lặp liên kết theo url (hoặc _id nếu có)
          const seen = new Set();
          return merged.filter((item) => {
            const id = item._id || item.url;
            if (!id) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });

        setNextCursor(linksData.nextCursor || null);
        setHasMore(!!linksData.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Lỗi lấy links trong explorer:", err);
        setError("ERROR");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsFetching(false);
      }
    }
  };

  const handleRefresh = () => {
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    fetchLinksData(null, true);
  };

  useEffect(() => {
    handleRefresh();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [conversationId]);

  const sentinelRef = useInfiniteScroll({
    enabled: !error && hasMore && !isFetching,
    hasMore,
    isFetching,
    onLoadMore: () => fetchLinksData(nextCursor),
    rootRef: scrollRef,
  });

  const { hasNewItems, refresh } = useExplorerFreshness({
    conversationId,
    type: "links",
    socket,
    currentUserId,
  });

  return (
    <div className="flex flex-col relative">
      {hasNewItems && (
        <div className="sticky top-0 left-0 w-full flex justify-center pointer-events-none z-20 h-0 overflow-visible">
          <div 
            onClick={() => refresh(handleRefresh)}
            className="pointer-events-auto py-3 px-6 bg-blue-50/95 backdrop-blur-sm hover:bg-blue-100/95 border border-blue-200 text-blue-600 rounded-xl text-sm font-bold text-center cursor-pointer transition-all duration-200 shadow-lg flex items-center justify-center space-x-2.5 animate-bounce max-w-max"
          >
            <FaSync className="animate-spin text-[10px]" />
            <span>Có liên kết mới. Bấm để làm mới</span>
          </div>
        </div>
      )}

      {/* Lỗi tải dữ liệu */}
      {error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-2xl border border-red-100 space-y-3 my-4">
          <span className="text-sm text-red-500 font-semibold">Không thể tải danh sách liên kết</span>
          <button
            onClick={handleRefresh}
            className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-600 rounded-full text-xs font-bold hover:bg-red-200 transition-colors duration-200 shadow-sm"
          >
            <FaSync />
            <span>Thử lại</span>
          </button>
        </div>
      ) : items.length === 0 && !isFetching ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 italic text-sm">
          Chưa có liên kết nào được chia sẻ trong cuộc hội thoại này.
        </div>
      ) : (
        /* List hiển thị danh sách liên kết */
        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={item._id || `${item.url}_${idx}`}
              className="flex items-center justify-between p-3.5 bg-white hover:bg-gray-50 border border-gray-100 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                <div className="h-10 w-10 bg-blue-50 text-blue-500 flex items-center justify-center rounded-xl shrink-0">
                  <FaLink size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline break-all block"
                    title={item.url}
                  >
                    {item.url}
                  </a>
                  {item.hostname && (
                    <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider font-semibold">
                      {item.hostname}
                    </p>
                  )}
                </div>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 ml-3"
                title="Mở liên kết"
              >
                <FaExternalLinkAlt size={12} />
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Sentinel indicator cho infinite scroll */}
      {hasMore && !error && (
        <div ref={sentinelRef} className="w-full flex items-center justify-center py-4 min-h-[40px]">
          {isFetching && (
            <div className="flex space-x-1.5 justify-center items-center">
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce"></div>
            </div>
          )}
        </div>
      )}

      {/* Skeleton loader hiển thị khi nạp trang đầu tiên */}
      {isFetching && items.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div 
              key={idx} 
              className="flex items-center space-x-3.5 p-3.5 bg-gray-50/50 rounded-xl border border-gray-100 animate-pulse h-[70px]"
            >
              <div className="bg-gray-200 h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200 rounded w-5/6" />
                <div className="h-3 bg-gray-200 rounded w-1/5" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LinksExplorer;
