import React, { useEffect } from "react";
import { FaTimes, FaPlay } from "react-icons/fa";

/**
 * MediaLightbox
 * Component hiển thị phóng to ảnh/video chia sẻ.
 * Gắn class .media-lightbox-active và chặn nổi bọt phím Escape để tránh đóng Modal Shell.
 */
export const MediaLightbox = ({
  media,
  onClose,
}) => {
  useEffect(() => {
    if (!media) return;

    // Lắng nghe sự kiện keydown để chặn Escape nổi bọt
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true); // Dùng useCapture để chạy trước

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [media, onClose]);

  if (!media) return null;

  const isVideo = media.mimeType?.startsWith("video/");

  return (
    <div 
      className="media-lightbox-active fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4 select-none animate-fade-in"
      onClick={onClose}
    >
      {/* Nút đóng */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors duration-200 z-10"
        aria-label="Đóng xem thử"
      >
        <FaTimes size={20} />
      </button>

      {/* Container nội dung */}
      <div 
        className="relative max-w-full max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()} // Chặn đóng khi click vào ảnh/video
      >
        {isVideo ? (
          <video 
            src={media.url} 
            controls 
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl bg-black"
          />
        ) : (
          <img 
            src={media.url} 
            alt={media.originalName || "Ảnh chia sẻ"} 
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>

      {/* Thông tin metadata tệp tin */}
      <div 
        className="absolute bottom-4 left-4 right-4 text-center text-white/80 text-xs truncate max-w-lg mx-auto bg-black/30 px-4 py-2 rounded-full"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-semibold">{media.originalName || "Tệp tin"}</span>
      </div>
    </div>
  );
};

export default MediaLightbox;
