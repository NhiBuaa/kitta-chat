import React, { useState } from "react";
import {
  FaPaperPlane,
  FaPhone,
  FaVideo,
  FaInfoCircle,
  FaCheck,
  FaCheckDouble,
  FaPaperclip,
  FaArrowDown,
  FaExclamationTriangle
} from "react-icons/fa";
import UserStatus from "./UserStatus";
import { formatTimeAgo } from "../utils/formatTime";
import { getUserDisplayName } from "../utils/getUserDisplayName";

const ChatWindow = ({
  activeChat,
  currentChatUser,
  currentUser,
  messages,
  users,
  isFriend,
  isTyping,
  typingUserName,
  typingUserAvatar,
  scrollRef,
  getAvatarUrl,
  checkIsOnline,
  handleVideoCall,
  setShowGroupMembers,
  handleScrollToBottom,
  handleRetryMessage,
  loadMoreMessages,
  isLoadingMore,
  setHasNewUnread,
  hasNewUnread
}) => {
  // STATE
  const [showScrollButton, setShowScrollButton] = useState(false);

  // HÀM KIỂM TRA VỊ TRÍ ĐỂ HIỆN BUTTON SCROLL
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    // Nếu cách đáy hơn 150px thì hiện nút
    if (distanceToBottom > 150) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
      setHasNewUnread(false)
    }

    // Nếu kéo lên trên thì hiện load thêm tin nhắn
    if (scrollTop <= 50) {
      loadMoreMessages();
    }
  };


  if (!activeChat || !currentChatUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
          <FaPaperPlane size={40} className="text-gray-400 ml-2" />
        </div>
        <p className="text-lg">Chọn một cuộc trò chuyện để bắt đầu.</p>
      </div>
    );
  }

  return (
    <>
      {/* CHAT HEADER */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center">
          <img
            src={getAvatarUrl(currentChatUser.avatar)}
            className="w-11 h-11 rounded-full mr-3 object-cover border border-gray-200"
            alt="avatar"
          />
          <div>
            <h3 className="font-bold text-gray-800">
              {getUserDisplayName(currentChatUser)}
            </h3>
            {!currentChatUser.members && isFriend ? (
              <UserStatus
                user={currentChatUser}
                isOnline={checkIsOnline(currentChatUser)}
              />
            ) : null}

            {currentChatUser.members && (
              <span className="text-xs text-gray-500">
                {currentChatUser.members.length} thành viên
              </span>
            )}
          </div>
        </div>

        <div className="flex space-x-4 text-blue-600">
          <button
            className="hover:bg-gray-100 p-2 rounded-full transition-colors"
            onClick={() => alert("Tính năng gọi thoại đang phát triển")}
          >
            <FaPhone />
          </button>

          <button
            onClick={handleVideoCall}
            className="hover:bg-blue-100 p-2 rounded-full transition-colors text-blue-600"
            title="Gọi Video"
            disabled={currentChatUser.members}
          >
            <FaVideo />
          </button>

          {activeChat?.members && (
            <button
              onClick={() => setShowGroupMembers(true)}
              className="hover:bg-gray-100 p-2 rounded-full transition-colors"
              title="Quản lý thành viên"
            >
              <FaInfoCircle />
            </button>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-6 space-y-4 relative"
        ref={scrollRef}
        onScroll={handleScroll}
      >

        {/* Hiển thị vòng quay loading khi đang kéo thêm */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <span className="text-gray-400 text-sm">Đang tải tin nhắn cũ...</span>
          </div>
        )}

        {messages.map((message, index) => {
          const senderId = typeof message.sender === "object" ? message.sender?._id : message.sender;
          const isMe = senderId === currentUser._id;
          const isGroup = Boolean(activeChat.members);
          const senderInfo = typeof message.sender === "object" ? message.sender : null;
          const senderName = getUserDisplayName(senderInfo);
          const senderAvatar = senderInfo?.avatar || activeChat.avatar;
          const isSystemMessage = message.type === "system";
          const isSending = message.status === "sending";
          const isError = message.status === "error";

          if (isSystemMessage) {
            return (
              <div key={index} className="flex justify-center my-4">
                <div className="bg-gray-200 text-gray-600 text-xs px-4 py-1 rounded-full flex items-center shadow-sm">
                  {message.text}
                </div>
              </div>
            );
          }

          return (
            <div key={index}>
              {isGroup && !isMe && senderInfo && (
                <div className="flex items-center ml-2 mb-1">
                  <span className="text-xs font-semibold text-gray-600">
                    {senderName}
                  </span>
                </div>
              )}

              <div className={`flex ${isMe ? "justify-end" : ""}`}>
                {!isMe && !isGroup && (
                  <img
                    src={getAvatarUrl(activeChat.avatar)}
                    className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                    alt="avt"
                  />
                )}

                {!isMe && isGroup && (
                  <img
                    src={getAvatarUrl(senderAvatar)}
                    className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                    alt="avt"
                  />
                )}

                <div
                  className={`p-3 max-w-xs shadow-sm text-sm transition-opacity duration-300 ${isMe
                    ? "bg-green-600 text-white rounded-l-2xl rounded-br-2xl"
                    : "bg-white text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl"
                    } ${isSending ? "opacity-70" : "opacity-100"} ${isError ? "border-2 border-red-400" : ""
                    }`}
                >
                  {/* Render files */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="flex flex-col gap-2 mb-2">
                      {message.attachments.map((file) => {
                        if (file.mimeType?.startsWith("image/")) {
                          return (
                            <img
                              key={file._id}
                              src={file.url}
                              alt="img"
                              className="w-full h-auto rounded-lg cursor-pointer hover:opacity-90 bg-gray-100"
                              onClick={() => window.open(file.url, "_blank")}
                            />
                          );
                        }
                        if (file.mimeType?.startsWith("video/")) {
                          return (
                            <video
                              key={file._id}
                              src={file.url}
                              controls
                              className="w-full h-auto rounded-lg bg-black"
                            />
                          );
                        }
                        return (
                          <a
                            key={file._id}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-lg transition text-xs font-medium ${isMe
                              ? "bg-green-700 hover:bg-green-800 text-white"
                              : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                              }`}
                          >
                            <FaPaperclip className="text-lg" />
                            <span className="truncate">{file.originalName}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {/* Render tin nhắn */}
                  {message.text && <span>{message.text}</span>}
                  {isMe && (
                    <div className="self-end mt-1 flex justify-end items-center gap-1">
                      {isSending && (
                        <span className="text-[10px] text-green-200 italic">Đang gửi...</span>
                      )}

                      {isError && (
                        <span
                          onClick={() => handleRetryMessage(message)}
                          title="Gửi lại"
                          className="text-[10px] text-red-200 font-bold flex items-center gap-1 cursor-pointer">
                          <FaExclamationTriangle />
                          Lỗi gửi
                        </span>
                      )}

                      {/* Chỉ hiện tích xanh/xám khi tin nhắn đã gửi xong (không có status hoặc status là sent) */}
                      {(!message.status || message.status === "sent") && (
                        <>
                          {!isGroup ? (
                            message.isRead ? (
                              <FaCheckDouble className="text-xs text-blue-200 inline-block" />
                            ) : (
                              <FaCheck className="text-xs text-green-200 inline-block" />
                            )
                          ) : message.readBy && message.readBy.length > 0 ? (
                            <FaCheckDouble className="text-xs text-blue-200 inline-block" />
                          ) : (
                            <FaCheck className="text-xs text-green-200 inline-block" />
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Những người đã xem trong group */}
                  {isMe &&
                    isGroup &&
                    message.readBy &&
                    message.readBy.length > 0 &&
                    (() => {
                      const readerIds = message.readBy.map((reader) =>
                        typeof reader === "object" ? reader._id : reader,
                      );
                      const readerNames = readerIds.map((id) => {
                        const member =
                          activeChat?.members?.find((groupMember) => groupMember._id === id) ||
                          users.find((user) => user._id === id);
                        return getUserDisplayName(member);
                      });

                      return (
                        <div className="text-[11px] mt-1 text-gray-200/90">
                          <span className="text-white/70">Đã xem:</span>{" "}
                          <span className="font-medium">{readerNames.join(", ")}</span>
                        </div>
                      );
                    })()}
                </div>
              </div>
              <div
                className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left ml-10"
                  }`}
              >
                {formatTimeAgo(message.createdAt)}
              </div>
            </div>
          );
        })}

        {/* hiển thị trạng thái đang nhập tin nhắn */}
        {isTyping && (
          <div className="flex items-center ml-2 mt-2">
            <img
              src={getAvatarUrl(
                activeChat.members ? typingUserAvatar : activeChat.avatar,
              )}
              className="w-6 h-6 rounded-full mr-2 object-cover"
              alt="typing"
            />
            <div>
              {typingUserName && activeChat.members && (
                <div className="text-xs text-gray-500 ml-1 mb-1">
                  {typingUserName} đang nhập tin nhắn...
                </div>
              )}
              <div className="bg-gray-200 p-3 rounded-2xl rounded-tl-none flex items-center space-x-1 w-16 h-9">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        )}

        {showScrollButton && (
          <button
            onClick={handleScrollToBottom}
            className="sticky bottom-4 left-full z-50 bg-white border border-gray-200 text-green-600 hover:bg-blue-50 hover:text-green-700 rounded-full p-3 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-110 flex items-center justify-center opacity-90 hover:opacity-100"
            title="Cuộn xuống tin nhắn mới nhất"
          >
            <FaArrowDown size={16} />
            {hasNewUnread && (
              <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </button>
        )}
      </div>
    </>
  );
};

export default ChatWindow;