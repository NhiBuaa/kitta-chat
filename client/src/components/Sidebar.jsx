import React from "react";
import { FaUserPlus, FaBell, FaSearch, FaUsers, FaCheck, FaHistory } from "react-icons/fa";
import { FiLogOut } from "react-icons/fi";
import CallHistoryBadge from './CallHistoryBadge.jsx';

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
  groups,
  handleSelectUser,
  usersToDisplay,
  sentRequests,
  checkIsOnline,
  renderLastMessage,
  handleAddFriend,
  setShowCallHistoryModal
}) => {
  return (

    <div className="w-full sm:w-[280px] md:w-[320px] lg:w-[460px] min-w-0 sm:min-w-[240px] h-full bg-white border-r border-gray-200 flex flex-col">
      {/* tên app với avt */}
      <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-blue-600 text-white relative z-10 shadow-md h-16">
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
              className="w-9 h-9 rounded-full object-cover border-2 border-blue-400"
            />
            {/* online chấm xanh hiện  */}
            <span className="absolute bottom-0 right-0 block h-2 w-2 md:h-2.5 md:w-2.5 rounded-full ring-2 ring-white bg-green-400"></span>
          </button>

          {/* tên app */}
          <h1 className="text-base md:text-xl font-bold truncate">KittaChat</h1>
        </div>
        {/* icon kế bên tên app */}
        <div className="flex items-center gap-2 sm:gap-3 flex-nowrap shrink-0">
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-white hover:text-blue-200"
            title="Tạo nhóm trò chuyện"
          >
            <FaUsers size={18} />
          </button>

          <button
            onClick={() => setShowCallHistoryModal?.(true)}
            className="relative p-1 hover:text-blue-200"
            title="Lịch sử cuộc gọi"
          >
            <FaHistory size={16} />
            <CallHistoryBadge />
          </button>

          {/* nút addfr */}
          <button
            onClick={() => setShowRequestModal(true)}
            className="relative p-1 hover:text-blue-200"
            title="Thông báo kết bạn"
          >
            <FaBell
              size={16}
              className={`transition-all duration-300 ${requestCount > 0
                ? "text-yellow-300 animate-pulse"
                : "hover:text-blue-200"
                }`}
            />
            {requestCount > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 bg-red-600 text-[10px] flex items-center justify-center rounded-full border border-blue-600 text-white font-bold">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 border-2 border-blue-600 text-white text-[10px] font-bold items-center justify-center">
                  {requestCount > 9 ? "9+" : requestCount}
                </span>
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            className="ml-1 bg-blue-800 hover:bg-blue-900 px-2 py-1.5 rounded text-[10px] font-bold uppercase whitespace-nowrap shadow-sm flex items-center"
          >
            {/* Trên màn hình lớn hiện chữ */}
            <span className="hidden md:inline">Đăng xuất</span>
            {/* Trên màn hình nhỏ hiện icon */}
            <span className="md:hidden">
              <FiLogOut size={14} />
            </span>
          </button>
        </div>
      </div>

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

      <div className="flex-1 overflow-y-aut pb-2">
        {/* Groups */}
        {groups.length > 0 && (
          <>
            <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
              Nhóm chat
            </div>
            {groups.map((group) => (
              <div
                key={group._id}
                onClick={() => handleSelectUser(group)}
                className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
              >
                <img
                  src={getAvatarUrl(group.avatar)}
                  className="w-10 h-10 rounded-full object-cover"
                  alt="Group avatar"
                />
                <div className="ml-3">
                  <h3 className="font-semibold text-sm">{group.name}</h3>
                  <p className="text-xs text-gray-400">
                    {group.members.length} thành viên
                  </p>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Users */}
        <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">
          Tin nhắn
        </div>
        {usersToDisplay.length > 0 ? (
          usersToDisplay.map((user) => {
            const isMe = user._id === currentUser?._id;
            if (isMe) return null;

            const isFriend = Boolean(user.isFriend);
            const isPendingRequest = Boolean(
              user.isSent ||
              user.isIncomingRequest ||
              user.isReceived ||
              sentRequests.includes(user._id),
            );
            const hasUnread = Boolean(user.hasUnread);

            return (
              <div
                key={user._id}
                onClick={() => handleSelectUser(user)}
                className={`group px-4 py-3 flex items-center gap-3 border-b border-gray-100 transition cursor-pointer ${hasUnread
                  ? "bg-blue-50 hover:bg-blue-100"
                  : "hover:bg-gray-100"
                  }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={getAvatarUrl(user.avatar)}
                    alt="Avt"
                    className="w-12 h-12 rounded-full object-cover border border-gray-200"
                  />
                  {/* DOT */}
                  {isFriend && checkIsOnline(user) && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-sm truncate pr-2 ${hasUnread
                        ? "font-bold text-gray-900"
                        : "font-semibold text-gray-800"
                        }`}
                    >
                      {user.displayName}
                    </h3>
                    {user.lastMessage && (
                      <span
                        className={`text-[10px] flex-shrink-0 ${hasUnread
                          ? "text-blue-600 font-bold"
                          : "text-gray-400"
                          }`}
                      >
                        {new Date(
                          user.lastMessage.createdAt,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center h-5">
                    <p className="text-xs truncate text-gray-500 w-full">
                      {searchTerm && !isFriend && !user.lastMessage ? (
                        <span className="text-blue-500">
                          Người lạ • Kết bạn
                        </span>
                      ) : (
                        renderLastMessage(user, currentUser._id)
                      )}
                    </p>
                  </div>
                </div>

                {!isFriend && (
                  <div className="ml-2 flex-shrink-0">
                    {isPendingRequest ? (
                      <button
                        disabled
                        className="flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-500 rounded-full cursor-not-allowed"
                      >
                        <FaCheck size={12} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleAddFriend(e, user)}
                        className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition shadow-sm"
                      >
                        <FaUserPlus size={14} />
                      </button>
                    )}
                  </div>
                )}
                {hasUnread && isFriend && (
                  <div className="ml-2 flex-shrink-0">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow animate-bounce">
                      {user.unreadCount > 9 ? "9+" : user.unreadCount}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 flex flex-col items-center justify-center text-gray-500 px-6 text-center">
            <FaSearch className="mt-3 text-3xl text-gray-300 mb-3" />

            {searchTerm ? (
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
                  Không có tin nhắn nào
                </p>
                <p className="text-xs mt-1 text-gray-400">
                  Hãy bắt đầu cuộc trò chuyện hoặc tìm kiếm bạn bè.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
