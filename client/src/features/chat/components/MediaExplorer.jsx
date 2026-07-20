import React, { useState, useEffect, useRef } from "react";
import { FaPlay, FaSync } from "react-icons/fa";
import { getPanelResources } from "@/services/api/conversationPanelApi.js";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll.js";
import { useExplorerFreshness } from "../hooks/useExplorerFreshness.js";
import MediaLightbox from "./MediaLightbox.jsx";

/**
 * MediaExplorer
 * Component hiển thị danh sách ảnh/video lịch sử chia sẻ phân trang vô hạn (Infinite Scroll),
 * hỗ trợ Freshness Banner realtime và trình xem ảnh lớn MediaLightbox.
 */
export const MediaExplorer = ({
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
  const [selectedMedia, setSelectedMedia] = useState(null);

  const abortControllerRef = useRef(null);

  // Gọi API lấy tài nguyên media
  const fetchMediaData = async (cursor = null, isReset = false) => {
    // Stale Response Protection: Hủy bỏ request đang chạy cũ nếu có
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsFetching(true);
    setError(null);

    try {
      const response = await getPanelResources(conversationId, "media", cursor, {
        signal: controller.signal,
      });

      const mediaData = response.data?.resourcesPreview?.media;
      if (mediaData) {
        if (mediaData.status === "error") {
          throw new Error("API returned error status");
        }

        const newItems = mediaData.items || [];
        
        setItems((prev) => {
          const merged = isReset ? newItems : [...prev, ...newItems];
          // Cursor Deduplication: Lọc bỏ trùng lặp tệp tin theo _id
          const seen = new Set();
          return merged.filter((item) => {
            if (!item._id) return true;
            if (seen.has(item._id)) return false;
            seen.add(item._id);
            return true;
          });
        });

        setNextCursor(mediaData.nextCursor || null);
        setHasMore(!!mediaData.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      if (err.name !== "CanceledError" && err.name !== "AbortError") {
        console.error("Lỗi lấy media trong explorer:", err);
        setError("ERROR");
      }
    } finally {
      // Giải phóng ref nếu đúng request hiện tại hoàn tất
      if (abortControllerRef.current === controller) {
        setIsFetching(false);
      }
    }
  };

  // Reset và tải lại trang đầu tiên
  const handleRefresh = () => {
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    fetchMediaData(null, true);
  };

  // Kích hoạt nạp dữ liệu khi thay đổi conversation
  useEffect(() => {
    handleRefresh();

    return () => {
      // Cleanup: Hủy request đang chạy khi unmount hoặc đổi conversation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [conversationId]);

  // Đăng ký infinite scroll
  const sentinelRef = useInfiniteScroll({
    enabled: !error && hasMore && !isFetching,
    hasMore,
    isFetching,
    onLoadMore: () => fetchMediaData(nextCursor),
    rootRef: scrollRef,
  });

  // Tích hợp Freshness Banner qua hook useExplorerFreshness
  const { hasNewItems, refresh } = useExplorerFreshness({
    conversationId,
    type: "media",
    socket,
    currentUserId,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Freshness Notification Banner */}
      {hasNewItems && (
        <div 
          onClick={() => refresh(handleRefresh)}
          className="absolute top-[72px] left-1/2 -translate-x-1/2 z-20 mb-4 p-2.5 bg-blue-50/95 backdrop-blur-sm hover:bg-blue-100/95 border border-blue-200 text-blue-600 rounded-xl text-xs font-bold text-center cursor-pointer transition-all duration-200 shadow-md flex items-center justify-center space-x-2 animate-bounce"
        >
          <FaSync className="animate-spin text-[10px]" />
          <span>Có tài nguyên mới. Bấm để làm mới</span>
        </div>
      )}

      {/* Lỗi tải dữ liệu */}
      {error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-2xl border border-red-100 space-y-3 my-4">
          <span className="text-sm text-red-500 font-semibold">Không thể tải danh sách ảnh / video</span>
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
          Chưa có ảnh hoặc video nào được chia sẻ trong cuộc hội thoại này.
        </div>
      ) : (
        /* Grid hiển thị lưới ảnh và video */
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => {
            const isVideo = item.mimeType?.startsWith("video/");
            return (
              <div
                key={item._id}
                onClick={() => setSelectedMedia(item)}
                className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-150 relative group cursor-pointer shadow-sm hover:shadow-md transition-all duration-300"
              >
                <img
                  src={item.url}
                  alt={item.originalName || "Shared media"}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                
                {/* Play button overlay cho video */}
                {isVideo && (
                  <div className="absolute inset-0 bg-black/35 flex items-center justify-center group-hover:bg-black/25 transition-colors duration-200">
                    <FaPlay className="text-white text-sm opacity-85 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200" />
                  </div>
                )}
              </div>
            );
          })}
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
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div 
              key={idx} 
              className="bg-gray-200/70 h-full aspect-square rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Trình xem ảnh lớn phóng to Lightbox */}
      {selectedMedia && (
        <MediaLightbox
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
        />
      )}
    </div>
  );
};

export default MediaExplorer;
