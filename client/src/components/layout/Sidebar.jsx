import React from "react";
import { FaUserPlus, FaBell, FaSearch, FaUsers, FaCheck, FaHistory, FaThumbtack, FaBellSlash } from "react-icons/fa";
import { FiLogOut } from "react-icons/fi";
import CallHistoryBadge from '@/features/calls/components/CallHistoryBadge.jsx';
import { useInfiniteScroll } from "@/features/chat/hooks/useInfiniteScroll.js";
import { useSocket } from "@/services/socket/SocketContext.js";

const FILTER_CHIPS = [
  { key: "all", label: "Tất cả" },
  { key: "direct", label: "Cá nhân" },
  { key: "group", label: "Nhóm" },
];

const Sidebar = ({
  currentUser,
  setShowProfile,
  getAvatarUrl,
  setShowCreateGroup,
  setShowRequestModal,
  requestCount,
  handleLogout,
  searchTerm,
  setSearchTerm,
  isSearching,
  conversations,
  activeFilter,
  setActiveFilter,
  handleSelectUser,
  sentRequests,
  checkIsOnline,
  handleAddFriend,
  setShowCallHistoryModal,
  onLoadMore,
  hasMore,
  isFetching,
}) => {
  const { onlineUsers = [] } = useSocket() || {};

  const sentinelRef = useInfiniteScroll({
    enabled: true,
    hasMore,
    isFetching,
    onLoadMore,
  });

  const formatContentFallback = (msg) => {
    if (!msg) return "";
    const rawContent = msg.content || msg.text || "";
    if (rawContent && rawContent.trim()) return rawContent;
    if (msg.type === "call_log") {
      return msg.callData?.status === "missed" ? "[Cuộc gọi nhỡ]" : (msg.callData?.type === "audio" ? "[Cuộc gọi thoại]" : "[Cuộc gọi video]");
    }
    if (msg.type === "image" || msg.image) return "[Hình ảnh]";
    if (msg.type === "video") return "[Video]";
    if (msg.type === "file" || msg.file || (msg.attachments && msg.attachments.length > 0)) return "[Tệp tin]";
    return "";
  };

  const renderSubtitle = (conv) => {
    if (conv.lastMessage) {
      const text = formatContentFallback(conv.lastMessage) || conv.lastMessage.content || "";
      if (conv.kind === "group") {
        const prefix = conv.lastMessage.senderName ? `${conv.lastMessage.senderName}: ` : "";
        return `${prefix}${text}`;
      }
      return text;
    }
    // Fallback khi không có tin nhắn
    if (conv.isGlobalUserSearchResult && conv.target?.isFriend === false) {
      const targetId = conv.target?._id || conv.target?.id;
      const requestWasSent = Boolean(
        conv.target?.isSent ||
        (Array.isArray(sentRequests) && sentRequests.some(
          (requestUserId) => String(requestUserId) === String(targetId),
        )),
      );
      if (conv.target?.isReceived) return "Đã gửi lời mời kết bạn cho bạn";
      return requestWasSent ? "Đã gửi lời mời kết bạn" : "Chưa kết bạn";
    }
    if (conv.kind === "group") {
      return `${conv.target?.memberCount || 0} thành viên`;
    }
    return "Bắt đầu trò chuyện";
  };



  const isTargetOnline = (conv) => {
    if (conv.kind !== "direct") return false;
    const targetId = conv.target?._id || conv.target?.id;
    if (targetId && onlineUsers.some((u) => String(u.userId) === String(targetId))) {
      return true;
    }
    if (conv.target && checkIsOnline && checkIsOnline(conv.target)) return true;
    if (conv.target?.isOnline) return true;
    if (conv.target?.activityStatus?.state === "active") return true;
    return false;
  };

  const renderSkeletonLoader = () => (
    <div className="p-3 space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-gray-200 rounded w-1/2"></div>
            <div className="h-3 bg-gray-100 rounded w-3/4"></div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmptyState = () => {
    const isSearch = searchTerm && searchTerm.trim().length > 0;

    if (activeFilter === "direct") {
      return (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-500 px-6 text-center">
          <FaSearch className="mt-3 text-3xl text-gray-300 mb-3" />
          {isSearch ? (
            <>
              <p className="text-sm font-semibold text-gray-700">
                Không tìm thấy kết quả cá nhân nào
              </p>
              <p className="text-xs mt-1 text-gray-400">
                Hãy thử tìm với tên hiển thị khác.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">
                Chưa có cuộc trò chuyện cá nhân
              </p>
              <p className="text-xs mt-1 text-gray-400">
                Tìm kiếm bạn bè trên thanh tìm kiếm để bắt đầu cuộc trò chuyện mới
              </p>
            </>
          )}
        </div>
      );
    }

    if (activeFilter === "group") {
      return (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-500 px-6 text-center">
          <FaUsers className="mt-3 text-3xl text-gray-300 mb-3" />
          {isSearch ? (
            <>
              <p className="text-sm font-semibold text-gray-700">
                Không tìm thấy nhóm nào
              </p>
              <p className="text-xs mt-1 text-gray-400">
                Hãy thử tìm với tên nhóm khác.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">
                Bạn chưa tham gia nhóm chat nào
              </p>
            </>
          )}
          <button
            onClick={() => setShowCreateGroup(true)}
            className="mt-3 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-full hover:bg-green-600 transition shadow-sm"
          >
            Tạo nhóm mới
          </button>
        </div>
      );
    }

    // Tab "Tất cả" (default)
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-gray-500 px-6 text-center">
        <FaSearch className="mt-3 text-3xl text-gray-300 mb-3" />
        {isSearch ? (
          <>
            <p className="text-sm font-semibold text-gray-700">
              Không tìm thấy kết quả nào
            </p>
            <p className="text-xs mt-1 text-gray-400">
              Hãy thử tìm với cách viết khác hoặc kết hợp từ khóa khác.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-700">
              Không có cuộc trò chuyện nào
            </p>
            <p className="text-xs mt-1 text-gray-400">
              Tìm kiếm bạn bè để bắt đầu cuộc trò chuyện mới
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="w-full sm:w-[280px] md:w-[320px] lg:w-[460px] min-w-0 sm:min-w-[240px] h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-[#4CAF50] to-[#66BB6A] text-white relative z-10 shadow-md h-16">
        <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0 mr-2">
          {/* avt */}
          <button
            onClick={() => setShowProfile(true)}
            className="focus:outline-none group relative shrink-0"
            title="Hồ sơ của bạn"
          >
            <img
              src={getAvatarUrl(currentUser?.avatar)}
              alt="User Avatar"
              className="w-9 h-9 rounded-full object-cover border-2 border-green-300"
            />
            {/* online chấm xanh hiện  */}
            {(currentUser?.activityStatus?.state === "active") && (
              <span className="absolute bottom-0 right-0 block h-2 w-2 md:h-2.5 md:w-2.5 rounded-full ring-2 ring-white bg-green-400"></span>
            )}
          </button>

          {/* tên app */}
          <h1 className="text-base md:text-xl font-bold truncate">KittaChat</h1>
        </div>
        {/* icon kế bên tên app */}
        <div className="flex items-center gap-2 sm:gap-3 flex-nowrap shrink-0">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-white hover:text-green-200 transition"
            title="Tạo nhóm trò chuyện"
          >
            <FaUsers size={20} />
          </button>

          <button
            onClick={() => setShowCallHistoryModal?.(true)}
            className="relative p-1 hover:text-blue-200"
            title="Lịch sử cuộc gọi"
          >
            <FaHistory size={18} />
            <CallHistoryBadge />
          </button>

          {/* nút addfr */}
          <button
            onClick={() => setShowRequestModal(true)}
            className="relative p-1 hover:text-blue-200"
            title="Thông báo kết bạn"
          >
            <FaBell
              size={18}
              className={`transition-all duration-300 ${requestCount > 0
                ? "text-yellow-300 animate-pulse"
                : "hover:text-green-200"
                }`}
            />
            {requestCount > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 bg-red-600 text-[10px] flex items-center justify-center rounded-full border border-green-600 text-white font-bold">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 border-2 border-green-600 text-white text-[10px] font-bold items-center justify-center">
                  {requestCount > 9 ? "9+" : requestCount}
                </span>
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="ml-1 bg-slate-200 text-slate-700 hover:bg-slate-300 px-2 py-1.5 rounded text-[10px] font-bold uppercase whitespace-nowrap shadow-sm flex items-center transition"
          >
            {/* Trên màn hình lớn hiện chữ */}
            <span className="hidden md:inline">Đăng xuất</span>
            {/* Trên màn hình nhỏ hiện icon */}
            <span className="md:hidden">
              <FiLogOut size={18} />
            </span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <FaSearch className="absolute top-3 left-3 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {isSearching && (
            <div className="absolute top-3 right-3 animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div className="px-4 pb-3 flex gap-2">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setActiveFilter(chip.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              activeFilter === chip.key
                ? "bg-green-500 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto pb-2">
        {conversations.length > 0 ? (
          conversations.map((conv) => {
            const unreadCount = Number(conv.unreadCount || 0);
            const hasUnread = unreadCount > 0;
            const online = isTargetOnline(conv);
            const displayName = conv.target?.displayName || "Không rõ";
            const targetId = conv.target?._id || conv.target?.id;
            const isGlobalUserSearchResult = Boolean(conv.isGlobalUserSearchResult);
            const isExplicitNonFriend = conv.target?.isFriend === false;
            const hasSentRequest = Boolean(
              conv.target?.isSent ||
              (Array.isArray(sentRequests) && sentRequests.some(
                (requestUserId) => String(requestUserId) === String(targetId),
              )),
            );
            const hasIncomingRequest = Boolean(conv.target?.isReceived);
            const canOpenConversation = !isGlobalUserSearchResult || !isExplicitNonFriend;

            // Transform conv thành object tương thích handleSelectUser
            // handleSelectUser cần: _id (top-level), members (truthy cho group),
            // displayName, avatar, conversationId (legacy cho direct)
            const selectPayload = {
              _id: conv.target?._id,
              displayName: conv.target?.displayName,
              avatar: conv.target?.avatar,
              isOnline: online,
              isFriend: conv.target?.isFriend !== false,
              activityStatus: conv.target?.activityStatus,
              conversationId: conv.legacyConversationId || conv.conversationId,
              lastMessage: conv.lastMessage,
              ...(conv.kind === "group" ? { members: conv.target?.members || [], isGroup: true, name: conv.target?.displayName, admin: conv.target?.admin } : {}),
            };

            return (
              <div
                key={conv.conversationId || conv._id}
                onClick={() => {
                  if (canOpenConversation) handleSelectUser(selectPayload);
                }}
                className={`group px-4 py-3 flex items-center gap-3 border-b border-gray-100 transition ${
                  canOpenConversation ? "cursor-pointer" : "cursor-default"
                } ${
                  hasUnread
                    ? "bg-blue-50 hover:bg-blue-100"
                    : "hover:bg-gray-100"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={getAvatarUrl(conv.target?.avatar)}
                    alt="Avt"
                    className="w-12 h-12 rounded-full object-cover border border-gray-200"
                  />
                  {/* Online dot (direct chat only) */}
                  {online && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-sm truncate pr-2 flex items-center gap-1.5 ${
                        hasUnread
                          ? "font-bold text-gray-900"
                          : "font-semibold text-gray-800"
                      }`}
                    >
                      <span>{displayName}</span>
                      {conv.isMuted && <FaBellSlash className="text-gray-400 text-[10px] shrink-0" />}
                    </h3>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {conv.isPinned && <FaThumbtack className="text-green-600 text-[10px] shrink-0 transform rotate-45" />}
                      {conv.lastMessageAt && (
                        <span
                          className={`text-[10px] ${
                            hasUnread
                              ? "text-blue-600 font-bold"
                              : "text-gray-400"
                          }`}
                        >
                          {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center h-5">
                    <p className={`text-xs truncate w-full ${hasUnread ? "text-gray-900 font-semibold" : "text-gray-500"}`}>
                      {renderSubtitle(conv)}
                    </p>
                  </div>
                </div>

                {isGlobalUserSearchResult && isExplicitNonFriend && (
                  <div className="ml-2 flex-shrink-0">
                    {hasIncomingRequest ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowRequestModal?.(true);
                        }}
                        className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
                        title="Xem lời mời kết bạn"
                      >
                        Lời mời đến
                      </button>
                    ) : hasSentRequest ? (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500">
                        <FaCheck size={10} />
                        Đã gửi
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => handleAddFriend(event, conv.target)}
                        className="flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-green-600"
                        title="Gửi lời mời kết bạn"
                      >
                        <FaUserPlus size={10} />
                        Kết bạn
                      </button>
                    )}
                  </div>
                )}

                {unreadCount > 0 && (
                  <div className="ml-2 flex-shrink-0">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow animate-bounce">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  </div>
                )}
              </div>
            );
          })
          ) : null}

        {/* Sentinel Node & Infinite Scroll Loading Spinner */}
        {conversations.length > 0 && (
          <div ref={sentinelRef} className="h-8 flex items-center justify-center p-2">
            {isFetching && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>
                <span>Đang tải thêm...</span>
              </div>
            )}
          </div>
        )}

        {conversations.length === 0 && (isSearching ? renderSkeletonLoader() : renderEmptyState())}
      </div>
    </div>
  );
};

export default Sidebar;
