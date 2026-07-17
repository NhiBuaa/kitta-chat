import React, { useState, useEffect, useRef } from "react";
import { 
  FaTimes, 
  FaBell, 
  FaBellSlash, 
  FaThumbtack, 
  FaTrash, 
  FaSignOutAlt, 
  FaLock, 
  FaShieldAlt,
  FaPlay,
  FaSync,
  FaFileAlt,
  FaLink,
  FaDownload,
  FaExternalLinkAlt,
  FaUsers,
  FaCrown
} from "react-icons/fa";
import { FaThumbtackSlash } from "react-icons/fa6";
import { getPanelMetadata, getPanelResources, updatePanelPreference, leaveGroupPanel, deleteChatPanel } from "@/services/api/conversationPanelApi.js";
import { toast } from "react-toastify";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";
import ConfirmationModal from "@/components/ui/ConfirmationModal.jsx";
const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const ConversationPanel = ({
  isOpen,
  onClose,
  activeChat,
  currentChatUser,
  currentUser,
  getAvatarUrl,
  conversationId,
  onLeaveGroup,
  onDeleteHistory,
  onPreferenceChange,
  onManageMembers,
}) => {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State quản lý Shared Media (Slice 3)
  const [mediaState, setMediaState] = useState({
    items: [],
    loading: false,
    error: null,
    hasMore: false,
    nextCursor: null
  });

  // State quản lý Shared Files (Slice 4)
  const [filesState, setFilesState] = useState({
    items: [],
    loading: false,
    error: null,
    hasMore: false,
    nextCursor: null
  });

  // State quản lý Shared Links (Slice 4)
  const [linksState, setLinksState] = useState({
    items: [],
    loading: false,
    error: null,
    hasMore: false,
    nextCursor: null
  });

  // State quản lý Membership (Slice 5)
  const [membershipState, setMembershipState] = useState({
    commonGroups: [],
    membersPreview: [],
    loading: false,
    error: null,
    hasMore: false,
    nextCursor: null
  });

  // Hàm tải Shared Media
  const fetchMedia = async () => {
    if (!conversationId) return;
    setMediaState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await getPanelResources(conversationId, "media");
      if (response.data && response.data.resourcesPreview?.media) {
        const mediaData = response.data.resourcesPreview.media;
        if (mediaData.status === "error") {
          setMediaState({
            items: [],
            loading: false,
            error: "ERROR",
            hasMore: false,
            nextCursor: null
          });
        } else {
          setMediaState({
            items: mediaData.items || [],
            loading: false,
            error: null,
            hasMore: !!mediaData.hasMore,
            nextCursor: mediaData.nextCursor || null
          });
        }
      }
    } catch (err) {
      console.error("Lỗi lấy media panel:", err);
      setMediaState(prev => ({ ...prev, loading: false, error: "ERROR" }));
    }
  };

  // Hàm tải Shared Files
  const fetchFiles = async () => {
    if (!conversationId) return;
    setFilesState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await getPanelResources(conversationId, "files");
      if (response.data && response.data.resourcesPreview?.files) {
        const filesData = response.data.resourcesPreview.files;
        if (filesData.status === "error") {
          setFilesState({
            items: [],
            loading: false,
            error: "ERROR",
            hasMore: false,
            nextCursor: null
          });
        } else {
          setFilesState({
            items: filesData.items || [],
            loading: false,
            error: null,
            hasMore: !!filesData.hasMore,
            nextCursor: filesData.nextCursor || null
          });
        }
      }
    } catch (err) {
      console.error("Lỗi lấy files panel:", err);
      setFilesState(prev => ({ ...prev, loading: false, error: "ERROR" }));
    }
  };

  // Hàm tải Shared Links
  const fetchLinks = async () => {
    if (!conversationId) return;
    setLinksState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await getPanelResources(conversationId, "links");
      if (response.data && response.data.resourcesPreview?.links) {
        const linksData = response.data.resourcesPreview.links;
        if (linksData.status === "error") {
          setLinksState({
            items: [],
            loading: false,
            error: "ERROR",
            hasMore: false,
            nextCursor: null
          });
        } else {
          setLinksState({
            items: linksData.items || [],
            loading: false,
            error: null,
            hasMore: !!linksData.hasMore,
            nextCursor: linksData.nextCursor || null
          });
        }
      }
    } catch (err) {
      console.error("Lỗi lấy links panel:", err);
      setLinksState(prev => ({ ...prev, loading: false, error: "ERROR" }));
    }
  };

  // Hàm tải Membership
  const fetchMembership = async () => {
    if (!conversationId) return;
    setMembershipState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await getPanelResources(conversationId, "membership");
      if (response.data && response.data.membership) {
        const memData = response.data.membership;
        if (memData.status === "error") {
          setMembershipState({
            commonGroups: [],
            membersPreview: [],
            loading: false,
            error: "ERROR",
            hasMore: false,
            nextCursor: null
          });
        } else {
          setMembershipState({
            commonGroups: memData.commonGroups || [],
            membersPreview: memData.membersPreview || [],
            loading: false,
            error: null,
            hasMore: !!memData.hasMoreMembers,
            nextCursor: memData.nextMemberCursor || null
          });
        }
      }
    } catch (err) {
      console.error("Lỗi lấy membership panel:", err);
      setMembershipState(prev => ({ ...prev, loading: false, error: "ERROR" }));
    }
  };

  // Theo dõi cuộc hội thoại đã được nạp tài nguyên để tránh nạp lại khi metadata thay đổi (preferences update)
  const loadedConvIdRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      loadedConvIdRef.current = null;
    }
  }, [isOpen, conversationId]);

  // Tải resources bất đồng bộ sau khi metadata được load
  useEffect(() => {
    if (conversationId && isOpen && metadata && loadedConvIdRef.current !== conversationId) {
      loadedConvIdRef.current = conversationId;
      fetchMedia();
      fetchFiles();
      fetchLinks();
      fetchMembership();
    }
  }, [conversationId, isOpen, metadata]);

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

  const handlePreferenceChange = async (key, value) => {
    if (!conversationId || !metadata) return;

    const previousPrefs = metadata.preference;
    
    // Optimistic UI Update
    setMetadata(prev => ({
      ...prev,
      preference: {
        ...prev.preference,
        [key]: value
      }
    }));

    try {
      const response = await updatePanelPreference(conversationId, { [key]: value });
      if (response.data && response.data.preference) {
        setMetadata(prev => ({
          ...prev,
          preference: response.data.preference
        }));
        onPreferenceChange?.(conversationId, response.data.preference);
        toast.success("Đã cập nhật cài đặt");
      }
    } catch (err) {
      console.error("Lỗi cập nhật cài đặt:", err);
      toast.error("Không thể lưu cài đặt");
      // Rollback
      setMetadata(prev => ({
        ...prev,
        preference: previousPrefs
      }));
    }
  };

  const handleDeleteHistoryClick = () => {
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteChatPanel(conversationId);
      if (res.data?.success) {
        toast.success("Xóa lịch sử thành công");
        onDeleteHistory?.(conversationId);
      }
    } catch (err) {
      console.error("Lỗi khi xóa lịch sử:", err);
      toast.error(err.response?.data?.message || "Không thể xóa lịch sử trò chuyện");
    } finally {
      setIsDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

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
                    src={getAvatarUrl(metadata.overview?.avatar || activeChat?.avatar || currentChatUser?.avatar)}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow-md"
                    alt="avatar"
                  />
                  {metadata.overview?.kind === "direct" && (metadata.overview?.isOnline ?? currentChatUser?.isOnline) && (
                    <div className="absolute bottom-0 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">
                    {metadata.overview?.name || activeChat?.name || getUserDisplayName(currentChatUser)}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {metadata.overview?.kind === "group"
                      ? `${metadata.overview?.memberCount || 0} thành viên`
                      : ((metadata.overview?.isOnline ?? currentChatUser?.isOnline) ? "Đang hoạt động" : "Ngoại tuyến")
                    }
                  </span>
                </div>
              </div>

              {/* Preferences Section */}
              <div className="space-y-1 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">Cài đặt</h4>
                
                <button
                  disabled={!metadata.permissions?.canPin}
                  onClick={() => handlePreferenceChange("isPinned", !metadata.preference?.isPinned)}
                  className={`w-full flex items-center space-x-3 p-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    metadata.permissions?.canPin 
                      ? "hover:bg-gray-50 text-gray-700 cursor-pointer" 
                      : "text-gray-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  {metadata.preference?.isPinned ? (
                    <FaThumbtackSlash className="text-green-500" />
                  ) : (
                    <FaThumbtack className="text-gray-400" />
                  )}
                  <span>{metadata.preference?.isPinned ? "Bỏ ghim hội thoại" : "Ghim hội thoại"}</span>
                </button>

                <button
                  disabled={!metadata.permissions?.canMute}
                  onClick={() => handlePreferenceChange("isMuted", !metadata.preference?.isMuted)}
                  className={`w-full flex items-center space-x-3 p-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    metadata.permissions?.canMute 
                      ? "hover:bg-gray-50 text-gray-700 cursor-pointer" 
                      : "text-gray-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  {metadata.preference?.isMuted ? (
                    <FaBellSlash className="text-red-400" />
                  ) : (
                    <FaBell className="text-gray-400" />
                  )}
                  <span>{metadata.preference?.isMuted ? "Bật thông báo" : "Tắt thông báo"}</span>
                </button>
              </div>

              {/* Permissions Warnings */}
              {!metadata.permissions?.canWrite && (
                <div className="p-3 bg-yellow-50 rounded-lg flex items-start space-x-3 text-yellow-700 text-xs border border-yellow-100">
                  <FaShieldAlt className="shrink-0 mt-0.5" />
                  <span>Bạn hiện không có quyền gửi tin nhắn trong cuộc hội thoại này (Chỉ đọc).</span>
                </div>
              )}

              {/* Shared Media Section (Slice 3) */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ảnh / Video</h4>
                  {mediaState.items.length > 0 && (
                    <button 
                      onClick={() => toast.info("Tính năng Xem tất cả đang được phát triển")}
                      className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Xem tất cả
                    </button>
                  )}
                </div>

                {mediaState.loading ? (
                  <div className="grid grid-cols-3 gap-2 px-2 animate-pulse">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="bg-gray-200 h-20 w-full rounded-lg"></div>
                    ))}
                  </div>
                ) : mediaState.error ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-lg border border-red-100 space-y-2 mx-2">
                    <span className="text-xs text-red-500 font-medium">Không thể tải ảnh / video</span>
                    <button
                      onClick={fetchMedia}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold hover:bg-red-200 transition-colors"
                    >
                      <FaSync className="text-[10px]" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                ) : mediaState.items.length === 0 ? (
                  <div className="text-center text-xs text-gray-400 py-4 italic">
                    Chưa có ảnh hoặc video nào được chia sẻ
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 px-2">
                    {mediaState.items.map((item) => (
                      <div 
                        key={item._id} 
                        className="relative group aspect-square bg-gray-150 rounded-lg overflow-hidden cursor-pointer border border-gray-100 shadow-sm"
                        onClick={() => window.open(item.url, "_blank")}
                      >
                        <img
                          src={item.url}
                          alt={item.originalName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {item.mimeType.startsWith("video/") && (
                          <div className="absolute inset-0 bg-black bg-opacity-25 flex items-center justify-center">
                            <FaPlay className="text-white text-xs opacity-80 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shared Files Section (Slice 4) */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tài liệu</h4>
                  {filesState.items.length > 0 && (
                    <button 
                      onClick={() => toast.info("Tính năng Xem tất cả đang được phát triển")}
                      className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Xem tất cả
                    </button>
                  )}
                </div>

                {filesState.loading ? (
                  <div className="space-y-2 px-2 animate-pulse">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="flex items-center space-x-3 py-2">
                        <div className="bg-gray-200 h-8 w-8 rounded"></div>
                        <div className="flex-1 space-y-1">
                          <div className="bg-gray-200 h-3 w-3/4 rounded"></div>
                          <div className="bg-gray-200 h-2.5 w-1/4 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filesState.error ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-lg border border-red-100 space-y-2 mx-2">
                    <span className="text-xs text-red-500 font-medium">Không thể tải tài liệu</span>
                    <button
                      onClick={fetchFiles}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold hover:bg-red-200 transition-colors"
                    >
                      <FaSync className="text-[10px]" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                ) : filesState.items.length === 0 ? (
                  <div className="text-center text-xs text-gray-400 py-4 italic">
                    Chưa có tài liệu nào được chia sẻ
                  </div>
                ) : (
                  <div className="space-y-2 px-2">
                    {filesState.items.map((item) => (
                      <div 
                        key={item._id} 
                        className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <FaFileAlt className="text-gray-400 shrink-0" size={18} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700 truncate" title={item.originalName}>
                              {item.originalName}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {formatFileSize(item.size)}
                            </p>
                          </div>
                        </div>
                        <a 
                          href={item.url} 
                          download={item.originalName} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                          title="Tải về"
                        >
                          <FaDownload size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Shared Links Section (Slice 4) */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Liên kết</h4>
                  {linksState.items.length > 0 && (
                    <button 
                      onClick={() => toast.info("Tính năng Xem tất cả đang được phát triển")}
                      className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Xem tất cả
                    </button>
                  )}
                </div>

                {linksState.loading ? (
                  <div className="space-y-2 px-2 animate-pulse">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="flex items-center space-x-3 py-2">
                        <div className="bg-gray-200 h-8 w-8 rounded-full"></div>
                        <div className="flex-1 space-y-1">
                          <div className="bg-gray-200 h-3 w-5/6 rounded"></div>
                          <div className="bg-gray-200 h-2.5 w-1/3 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : linksState.error ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-lg border border-red-100 space-y-2 mx-2">
                    <span className="text-xs text-red-500 font-medium">Không thể tải liên kết</span>
                    <button
                      onClick={fetchLinks}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold hover:bg-red-200 transition-colors"
                    >
                      <FaSync className="text-[10px]" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                ) : linksState.items.length === 0 ? (
                  <div className="text-center text-xs text-gray-400 py-4 italic">
                    Chưa có liên kết nào được chia sẻ
                  </div>
                ) : (
                  <div className="space-y-2 px-2">
                    {linksState.items.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <div className="bg-blue-50 p-2 rounded-lg text-blue-500 shrink-0">
                            <FaLink size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-700 truncate" title={item.url}>
                              {item.url}
                            </p>
                            <p className="text-[10px] text-gray-400 uppercase">
                              {item.hostname}
                            </p>
                          </div>
                        </div>
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                          title="Mở liên kết"
                        >
                          <FaExternalLinkAlt size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Membership Section (Slice 5) */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {metadata.overview?.kind === "group" ? "Thành viên nhóm" : "Nhóm chung"}
                  </h4>
                  {metadata.overview?.kind === "group" ? (
                    <button 
                      onClick={onManageMembers}
                      className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Quản lý
                    </button>
                  ) : (
                    membershipState.commonGroups.length > 0 && (
                      <button 
                        onClick={() => toast.info("Tính năng Xem tất cả đang được phát triển")}
                        className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors"
                      >
                        Xem tất cả
                      </button>
                    )
                  )}
                </div>

                {membershipState.loading ? (
                  <div className="space-y-2 px-2 animate-pulse">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="flex items-center space-x-3 py-2">
                        <div className="bg-gray-200 h-8 w-8 rounded-full"></div>
                        <div className="flex-1 space-y-1">
                          <div className="bg-gray-200 h-3 w-1/2 rounded"></div>
                          <div className="bg-gray-200 h-2.5 w-1/4 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : membershipState.error ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-lg border border-red-100 space-y-2 mx-2">
                    <span className="text-xs text-red-500 font-medium">Không thể tải thông tin thành viên</span>
                    <button
                      onClick={fetchMembership}
                      className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold hover:bg-red-200 transition-colors"
                    >
                      <FaSync className="text-[10px]" />
                      <span>Thử lại</span>
                    </button>
                  </div>
                ) : metadata.overview?.kind === "group" ? (
                  membershipState.membersPreview.length === 0 ? (
                    <div className="text-center text-xs text-gray-400 py-4 italic">
                      Chưa có thông tin thành viên
                    </div>
                  ) : (
                    <div className="space-y-2 px-2">
                      {membershipState.membersPreview.slice(0, 5).map((member) => (
                        <div 
                          key={member._id} 
                          className="flex items-center space-x-3 p-1 rounded-lg transition-colors"
                        >
                          <div className="relative">
                            <img
                              src={getAvatarUrl(member.avatar)}
                              className="w-8 h-8 rounded-full object-cover border border-gray-250"
                              alt={member.displayName}
                            />
                            {member.isOnline && (
                              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-white"></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700 truncate mr-2">
                              {member.displayName}
                            </span>
                            {member.role === "admin" && (
                              <span className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  membershipState.commonGroups.length === 0 ? (
                    <div className="text-center text-xs text-gray-400 py-4 italic">
                      Không có nhóm chung nào
                    </div>
                  ) : (
                    <div className="space-y-2 px-2">
                      {membershipState.commonGroups.slice(0, 5).map((grp) => (
                        <div 
                          key={grp._id} 
                          className="flex items-center space-x-3 p-1.5 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors"
                        >
                          <img
                            src={getAvatarUrl(grp.avatar)}
                            className="w-8 h-8 rounded-full object-cover border border-gray-200"
                            alt={grp.name}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">
                              {grp.name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {grp.memberCount} thành viên
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Actions Section */}
              <div className="space-y-2 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Hành động</h4>
                

                {metadata.permissions?.canDelete && (
                  <button 
                    onClick={handleDeleteHistoryClick}
                    className="w-full flex items-center space-x-3 p-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
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
      {confirmDeleteOpen && (
        <ConfirmationModal
          isOpen={confirmDeleteOpen}
          title="Xóa lịch sử trò chuyện"
          message="Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện của cuộc hội thoại này? Tin nhắn sẽ chỉ biến mất đối với bạn."
          type="danger"
          confirmText="Xóa lịch sử"
          cancelText="Hủy"
          isDangerous={true}
          isLoading={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
      </div>
    </div>
  );
};

export default ConversationPanel;
