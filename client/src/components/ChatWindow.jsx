import React, { useEffect, useRef, useState } from "react";
import {
  FaPaperPlane,
  FaArrowLeft,
  FaPhone,
  FaVideo,
  FaInfoCircle,
  FaCheck,
  FaCheckDouble,
  FaPaperclip,
  FaArrowDown,
  FaExclamationTriangle,
} from "react-icons/fa";
import UserStatus from "./UserStatus";
import { formatTimeAgo } from "../utils/formatTime";
import { getUserDisplayName } from "../utils/getUserDisplayName";
import Loader from "./deco/Loader";
import MessageSeenBy from './MessageSeenBy';
import OfflineBanner from "./OfflineBanner";

const ChatWindow = ({
  activeChat,
  setActiveChat,
  currentChatUser,
  currentUser,
  messages,
  users,
  isTyping,
  typingUserName,
  typingUserAvatar,
  scrollRef,
  bottomRef,
  getAvatarUrl,
  checkIsOnline,
  handleCall,
  setShowGroupMembers,
  handleScrollToBottom,
  onMediaContentLoad,
  onUserMovedAwayFromBottom,
  handleRetryMessage,
  loadMoreMessages,
  isLoadingMore,
  isChatBootstrapping = false,
  setHasNewUnread,
  hasNewUnread,
}) => {
  // STATE
  const [showScrollButton, setShowScrollButton] = useState(false);
  const topSentinelRef = useRef(null);
  const canLoadMoreFromTopRef = useRef(true);

  // BIẾN
  const isGroupChat = Boolean(activeChat?.members);
  const shouldShowOnlineStatus =
    !isGroupChat && Boolean(currentChatUser?.isFriend);

  useEffect(() => {
    canLoadMoreFromTopRef.current = true;
  }, [activeChat?._id]);

  useEffect(() => {
    const root = scrollRef?.current;
    const target = topSentinelRef.current;

    if (!root || !target || isChatBootstrapping) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (!entry) return;

        if (!entry.isIntersecting) {
          canLoadMoreFromTopRef.current = true;
          return;
        }

        if (canLoadMoreFromTopRef.current && !isLoadingMore) {
          canLoadMoreFromTopRef.current = false;
          loadMoreMessages();
        }
      },
      {
        root,
        threshold: 0.1,
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    activeChat?._id,
    isChatBootstrapping,
    isLoadingMore,
    loadMoreMessages,
    scrollRef,
  ]);

  // HÀM KIỂM TRA VỊ TRÍ ĐỂ HIỆN BUTTON SCROLL
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    // Nếu cách đáy hơn 150px thì hiện nút
    if (distanceToBottom > 150) {
      setShowScrollButton(true);
      onUserMovedAwayFromBottom?.();
    } else {
      setShowScrollButton(false);
      setHasNewUnread(false);
    }

    // Nếu kéo lên trên thì hiện load thêm tin nhắn
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
      {/* OFFLINE BANNER */}
      <OfflineBanner />

      {/* CHAT HEADER */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center">
          {/* chỉ hiện ở màn nhỏ */}
          <button
            onClick={() => setActiveChat(null)}
            className="sm:hidden mr-3 text-gray-600 hover:text-blue-600"
          >
            <FaArrowLeft size={18} />
          </button>
          <img
            src={getAvatarUrl(currentChatUser.avatar)}
            className="w-11 h-11 rounded-full mr-3 object-cover border border-gray-200"
            alt="avatar"
          />
          <div>
            <h3 className="font-bold text-gray-800">
              {getUserDisplayName(currentChatUser)}
            </h3>
            {shouldShowOnlineStatus && (
              <UserStatus
                user={currentChatUser}
                isOnline={checkIsOnline(currentChatUser)}
              />
            )}

            {currentChatUser.members && (
              <span className="text-xs text-gray-500">
                {currentChatUser.members.length} thành viên
              </span>
            )}
          </div>
        </div>

        <div className="flex space-x-4 text-blue-600">
          {/* Gọi audio */}
          <button
            onClick={() => handleCall("audio")}
            className="hover:bg-blue-100 p-2 rounded-full transition-colors text-blue-600"
            title="Gọi Audio"
            disabled={currentChatUser.members}
          >
            <FaPhone />
          </button>

          {/* Gọi video */}
          <button
            onClick={() => handleCall("video")}
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
        className="flex-1 overflow-y-auto p-6 space-y-4 relative bg-gradient-to-b from-gray-50 via-white to-gray-100"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        <div ref={topSentinelRef} className="h-px w-full" />
        {isChatBootstrapping && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/90">
            <div className="scale-[0.45] origin-center">
              <Loader />
            </div>
          </div>
        )}
        <div
          className={
            isChatBootstrapping
              ? "opacity-0 pointer-events-none"
              : "opacity-100"
          }
        >
          {/* Hiển thị chú chuột Hamster khi đang kéo thêm */}
          {isLoadingMore && (
            <div className="flex flex-col items-center justify-center py-4 bg-transparent">
              <div className="scale-[0.3] origin-center h-12 flex items-center justify-center">
                <Loader />
              </div>
            </div>
          )}

          {/* hiện hình với tên như ở fb khi chưa chat */}
          {Array.isArray(messages) &&
            messages.length === 0 &&
            !isChatBootstrapping && (
              <div className="flex flex-col items-center mt-16 opacity-80">
                <img
                  src={getAvatarUrl(currentChatUser.avatar)}
                  className="w-16 h-16 rounded-full mb-3 shadow"
                  alt="avatar"
                />

                <h2 className="text-gray-700 font-semibold">
                  {getUserDisplayName(currentChatUser)}
                </h2>

                <p className="text-sm text-gray-400 mt-1">
                  Các bạn đã là bạn bè trên KittaChat
                </p>
              </div>
            )}

          {Array.isArray(messages) && messages.map((message, index) => {
            const senderId = typeof message.sender === "object" ? message.sender?._id : message.sender;
            const isMe = senderId === currentUser._id;
            const isGroup = Boolean(activeChat.members);
            const senderInfo = typeof message.sender === "object" ? message.sender : null;
            const senderName = getUserDisplayName(senderInfo);
            const senderAvatar = senderInfo?.avatar || activeChat.avatar;
            const isSystemMessage = message.type === "system";
            const isSending = message.status === "sending";
            const isError = message.status === "error";
            const retryCount = message.retryCount || 0;
            const isMaxRetry = retryCount >= 3;

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
                                onLoad={onMediaContentLoad}
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
                                onLoadedMetadata={onMediaContentLoad}
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
                              <span className="truncate">
                                {file.originalName}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Render tin nhắn */}
                    {message.text && (
                      <div className="break-words overflow-hidden whitespace-pre-wrap leading-relaxed">
                        {message.text}
                      </div>
                    )}

                    {isMe && (
                      <div className="self-end mt-1 flex justify-end items-center gap-1">
                        {isSending && (
                          <span className="text-[10px] text-green-200 italic">Đang gửi...</span>
                        )}

                        {isError && !isMaxRetry && (
                          <button
                            onClick={() => handleRetryMessage(message)}
                            title="Nhấn để gửi lại"
                            className="flex items-center gap-1 text-[10px] text-red-300 font-semibold hover:text-red-200 transition-colors cursor-pointer bg-transparent border-none p-0"
                          >
                            <FaExclamationTriangle />
                            Gửi lại
                          </button>
                        )}

                        {isError && isMaxRetry && (
                          <span className="flex items-center gap-1 text-[10px] text-red-300 italic">
                            <FaExclamationTriangle />
                            Không gửi được
                            {message.text && (
                              <button
                                onClick={() => {
                                  navigator.clipboard?.writeText(message.text);
                                }}
                                className="underline hover:text-red-200 ml-1 bg-transparent border-none cursor-pointer p-0"
                              >
                                Sao chép
                              </button>
                            )}
                          </span>
                        )}

                        {(!message.status || message.status === "sent") && (
                          <>
                            {!isGroup && (
                              message.isRead ? (
                                <FaCheckDouble className="text-xs text-blue-200 inline-block" />
                              ) : (
                                <FaCheck className="text-xs text-green-200 inline-block" />
                              )
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Những người đã xem trong group */}
                {isMe && isGroup && message.readBy && message.readBy.length > 0 && (() => {
                  // Lọc và biến đổi danh sách ID thành danh sách Object User đầy đủ
                  const fullViewersData = message.readBy.map(reader => {
                    const readerId = typeof reader === "object" ? reader._id : reader;
                    // Tìm user từ danh sách members hoặc users
                    const userObj = activeChat?.members?.find(m => m._id === readerId) ||
                      users.find(u => u._id === readerId);

                    // Nếu tìm thấy thì trả về đủ thông tin, nếu không thì trả về object mặc định chống crash
                    return userObj ? userObj : { _id: readerId, displayName: "User", avatar: "" };
                  });

                  return (
                    <div className="mt-1 flex justify-end">
                      <MessageSeenBy
                        seenByList={fullViewersData}
                        currentUser={currentUser}
                        getAvatarUrl={getAvatarUrl}
                      />
                    </div>
                  );
                })()}
                <div
                  className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left ml-10"
                    }`}
                >
                  {formatTimeAgo(message.createdAt)}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}></div>

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
              className="sticky bottom-4 left-full z-50 bg-white border border-gray-200 text-green-600 hover:bg-green-50 hover:text-green-700 rounded-full p-3 shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-110 flex items-center justify-center opacity-90 hover:opacity-100"
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
          )
        </div>
      </div>
    </>
  );
};

export default ChatWindow;
