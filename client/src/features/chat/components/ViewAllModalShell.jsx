import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FaTimes } from "react-icons/fa";

/**
 * ViewAllModalShell
 * Component hạ tầng dùng chung cho các Modal Xem Tất Cả (View All).
 * Render qua Portal vào document.body, thiết kế Centered Modal với size prop linh hoạt.
 */
export const ViewAllModalShell = ({
  isOpen,
  onClose,
  title,
  size = "normal", // "normal" | "wide" | "fullscreen"
  scrollRef,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    // ESC handling with Blocker rule
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (document.querySelector(".media-lightbox-active")) {
          return; // Lightbox will handle this ESC press
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // CSS classes based on size prop
  let sizeClasses = "sm:max-w-xl"; // default "normal"
  if (size === "wide") {
    sizeClasses = "sm:max-w-4xl";
  } else if (size === "fullscreen") {
    sizeClasses = "max-w-full h-full rounded-none";
  }

  // Centered Modal Layout
  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Card container */}
      <div
        className={`relative z-10 w-full h-full sm:h-[85vh] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 transform scale-100 border border-gray-100 ${sizeClasses}`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200"
            aria-label="Đóng modal"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Scroll Container */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 min-h-0 bg-white"
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ViewAllModalShell;
