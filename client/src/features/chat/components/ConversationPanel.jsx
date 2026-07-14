import React, { useState, useEffect } from "react";
import { 
  FaTimes, 
  FaBell, 
  FaBellSlash, 
  FaThumbtack, 
  FaTrash, 
  FaSignOutAlt, 
  FaLock, 
  FaShieldAlt 
} from "react-icons/fa";
import { getPanelMetadata } from "@/services/api/conversationPanelApi.js";
import { toast } from "react-toastify";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";

const ConversationPanel = ({
  isOpen,
  onClose,
  activeChat,
  currentChatUser,
  currentUser,
  getAvatarUrl,
  conversationId,
}) => {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!conversationId || !isOpen) {
      return;
    }

    let isMounted = true;
    const fetchMetadata = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getPanelMetadata(conversationId);
        if (isMounted && response.data) {
          setMetadata(response.data);
        }
      } catch (err) {
        console.error("Lỗi lấy metadata panel:", err);
        if (isMounted) {
          if (err.response?.status === 403) {
            setError("FORBIDDEN");
            toast.error("Bạn không có quyền truy cập thông tin cuộc hội thoại này");
          } else {
            setError("ERROR");
            toast.error("Không thể tải thông tin chi tiết");
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false;
    };
  }, [conversationId, isOpen]);

  // Nếu không mở, chỉ trả về khung rỗng w-0 để tạo transition trượt mượt mà
  return (
    <div
      className={`h-full bg-white border-l border-gray-200 transition-all duration-300 ease-in-out overflow-hidden flex flex-col relative ${
        isOpen ? "w-80 opacity-100" : "w-0 opacity-0 pointer-events-none"
      }`}
    >
      <div className="w-80 h-full flex flex-col bg-white">
        {/* Header */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-4 shadow-sm shrink-0">
          <span className="font-bold text-gray-700">Chi tiết cuộc trò chuyện</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-colors"
            title="Đóng panel"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            // Skeleton Loader
            <div className="space-y-6 animate-pulse">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-20 h-20 bg-gray-200 rounded-full"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-10 bg-gray-150 rounded w-full"></div>
                <div className="h-10 bg-gray-150 rounded w-full"></div>
              </div>
            </div>
          ) : error === "FORBIDDEN" ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 mt-12 px-4 text-red-500">
              <FaLock size={40} className="text-red-400" />
              <h4 className="font-bold text-gray-800">Không có quyền truy cập</h4>
              <p className="text-sm text-gray-500">
                Bạn không phải là thành viên hoặc không có quyền xem lịch sử cuộc trò chuyện này.
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 mt-12 px-4 text-gray-500">
              <h4 className="font-bold text-gray-800">Lỗi tải dữ liệu</h4>
              <p className="text-sm text-gray-400">Đã xảy ra lỗi khi lấy thông tin từ máy chủ.</p>
            </div>
          ) : metadata ? (
            <>
              {/* Overview Section */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <img
                    src={getAvatarUrl(currentChatUser?.avatar || activeChat?.avatar || metadata.overview?.avatar)}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow-md"
                    alt="avatar"
                  />
                  {(metadata.overview?.isOnline !== undefined ? metadata.overview?.isOnline : currentChatUser?.isOnline) && (
                    <div className="absolute bottom-0 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">
                    {activeChat?.members ? activeChat.name : getUserDisplayName(currentChatUser)}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {activeChat?.members 
                      ? `${activeChat.members.length || 0} thành viên`
                      : (currentChatUser?.isOnline ? "Đang hoạt động" : "Ngoại tuyến")
                    }
                  </span>
                </div>
              </div>

              {/* Preferences Section (Placeholder UI - Slice 2) */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cài đặt</h4>
                
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-default select-none">
                  <div className="flex items-center space-x-3">
                    <FaThumbtack className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Ghim hội thoại</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={metadata.preference?.isPinned || false}
                    disabled={!metadata.permissions?.canPin}
                    readOnly
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-default"
                  />
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-default select-none">
                  <div className="flex items-center space-x-3">
                    {metadata.preference?.isMuted ? (
                      <FaBellSlash className="text-red-400" />
                    ) : (
                      <FaBell className="text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-700">Tắt thông báo</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={metadata.preference?.isMuted || false}
                    disabled={!metadata.permissions?.canMute}
                    readOnly
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-default"
                  />
                </div>
              </div>

              {/* Permissions Warnings */}
              {!metadata.permissions?.canWrite && (
                <div className="p-3 bg-yellow-50 rounded-lg flex items-start space-x-3 text-yellow-700 text-xs border border-yellow-100">
                  <FaShieldAlt className="shrink-0 mt-0.5" />
                  <span>Bạn hiện không có quyền gửi tin nhắn trong cuộc hội thoại này (Chỉ đọc).</span>
                </div>
              )}

              {/* Actions Section */}
              <div className="space-y-2 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Hành động</h4>
                
                {metadata.permissions?.canLeave && (
                  <button className="w-full flex items-center space-x-3 p-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                    <FaSignOutAlt />
                    <span>Rời nhóm</span>
                  </button>
                )}

                {metadata.permissions?.canDelete && (
                  <button className="w-full flex items-center space-x-3 p-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                    <FaTrash />
                    <span>Xóa lịch sử trò chuyện</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 mt-12 text-sm">
              Không có dữ liệu
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationPanel;
