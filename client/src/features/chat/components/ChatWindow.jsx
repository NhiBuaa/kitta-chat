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
  FaUsers,
} from "react-icons/fa";
import { toast } from "react-toastify";
import UserStatus from "@/features/profile/components/UserStatus.jsx";
import { formatTimeAgo } from "@/utils/formatTime.js";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";
import Loader from "@/components/common/Loader.jsx";
import ConfirmationModal from "@/components/ui/ConfirmationModal.jsx";
import UserProfileModal from "@/features/profile/components/UserProfileModal.jsx";
import MessageSeenBy from '@/features/chat/components/MessageSeenBy.jsx';
import OfflineBanner from "@/features/chat/components/OfflineBanner.jsx";
import CallLogItem from "@/features/calls/components/CallLogItem.jsx";
import { removeFriend } from "@/services/api/friendApi.js";
import { runRemoveFriendAction } from "@/features/friends/actions/removeFriendAction.js";
import {
  closeUserProfileModal,
  createClosedUserProfileModalState,
  openUserProfileModal,
} from "@/features/profile/components/userProfileModalState.js";
import {
  closeRemoveFriendModal,
  createClosedRemoveFriendModalState,
  finishRemoveFriendSubmit,
  openRemoveFriendModal,
} from "@/features/friends/actions/removeFriendModalState.js";


const renderMessageTextWithLinks = (text, isMe) => {
  if (!text) return "";
  const trimmed = text.trim();
  const splitRegex = /(https?:\/\/[^\s]+)/gi;
  const parts = trimmed.split(splitRegex);
  
  if (parts.length <= 1) {
    return trimmed;
  }
  
  return parts.map((part, index) => {
    // Dùng regex riêng không có flag 'g' để tránh bug lastIndex stateful
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      // NOTE: Regex loại bỏ dấu câu cuối URL có thể cắt sai dấu ')' hợp lệ
      // trong URL Wikipedia. Đây là edge case hiếm, chấp nhận tech debt.
      const cleanUrl = part.replace(/[.,;:!?)]+$/, "");
      const punctuation = part.slice(cleanUrl.length);
      return (
        <span key={index}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline hover:opacity-80 break-all ${
              isMe ? "text-blue-200 font-medium" : "text-blue-600 font-medium"
            }`}
          >
            {cleanUrl}
          </a>
          {punctuation}
        </span>
      );
    }
    return part;
  });
};

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
  showConversationPanel,
  setShowConversationPanel,
  isPanelEnabled,
}) => {
  // STATE
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [userProfileModal, setUserProfileModal] = useState(
    createClosedUserProfileModalState,
  );
  const [removeFriendModal, setRemoveFriendModal] = useState(
    createClosedRemoveFriendModalState,
  );
  const topSentinelRef = useRef(null);
  const canLoadMoreFromTopRef = useRef(true);
  const removeFriendSubmitInFlightRef = useRef(false);

  // BIẾN
  const isGroupChat = Boolean(activeChat?.members);
  const shouldShowOnlineStatus =
    !isGroupChat && currentChatUser?.isFriend !== false;

  useEffect(() => {
    canLoadMoreFromTopRef.current = true;
  }, [activeChat?._id]);

  const handleOpenRemoveFriendModal = () => {
    setRemoveFriendModal(openRemoveFriendModal(currentChatUser));
  };

  const handleOpenUserProfileModal = () => {
    if (isGroupChat) return;
    setUserProfileModal(openUserProfileModal(currentChatUser));
  };

  const handleCloseUserProfileModal = () => {
    setUserProfileModal(closeUserProfileModal());
  };

  const handleProfileUnfriend = () => {
    handleOpenRemoveFriendModal();
  };

  const handleCloseRemoveFriendModal = () => {
    setRemoveFriendModal((prev) => closeRemoveFriendModal(prev));
  };

  const handleConfirmRemoveFriend = async () => {
    if (removeFriendSubmitInFlightRef.current) return;

    // Read state synchronously before any setState to avoid closure race.
    const snapshot = removeFriendModal;
    if (!snapshot.isOpen || !snapshot.targetUser || snapshot.isLoading) return;
    const targetUserId = snapshot.targetUser._id;
    if (!targetUserId) return;

    removeFriendSubmitInFlightRef.current = true;
    setRemoveFriendModal((prev) => ({ ...prev, isLoading: true }));

    const result = await runRemoveFriendAction({
      friendId: targetUserId,
      removeFriend,
      toast,
    });

    removeFriendSubmitInFlightRef.current = false;
    setRemoveFriendModal((prev) =>
      finishRemoveFriendSubmit(prev, { closeOnSuccess: Boolean(result.success) }),
    );
    if (result.success) {
      setUserProfileModal(closeUserProfileModal());
    }
  };

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
          <button
            onClick={() => setActiveChat(null)}
            className="sm:hidden mr-3 text-gray-600 hover:text-green-600"
          >
            <FaArrowLeft size={18} />
          </button>
          <button
            type="button"
            onClick={
              isPanelEnabled 
                ? () => setShowConversationPanel(!showConversationPanel)
                : handleOpenUserProfileModal
            }
            disabled={!isPanelEnabled && isGroupChat}
            className="flex items-center text-left rounded-lg border-0 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-0 focus-visible:bg-gray-100"
            title={isPanelEnabled ? "Chi tiết cuộc trò chuyện" : (isGroupChat ? undefined : "Xem hồ sơ")}
          >
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
                  isOnline={checkIsOnline(currentChatUser) || currentChatUser?.isOnline || currentChatUser?.activityStatus?.state === "active"}
                />
              )}

              {currentChatUser.members && (
                <span className="text-xs text-gray-500">
                  {currentChatUser.members.length} Thành viên
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="flex space-x-4 text-green-600">
          <button
            onClick={() => handleCall("audio")}
            className="hover:bg-green-100 p-2 rounded-full transition-colors text-green-600"
            title="Gọi Audio"
            disabled={currentChatUser.members}
          >
            <FaPhone />
          </button>

          {/* Gọi video */}
          <button
            onClick={() => handleCall("video")}
            className="hover:bg-green-100 p-2 rounded-full transition-colors text-green-600"
            title="Gọi Video"
            disabled={currentChatUser.members}
          >
            <FaVideo />
          </button>

          {/* Chi tiết cuộc trò chuyện */}
          {isPanelEnabled && (
            <button
              onClick={() => setShowConversationPanel(!showConversationPanel)}
              className={`p-2 rounded-full transition-colors ${
                showConversationPanel 
                  ? "bg-green-100 text-green-600" 
                  : "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
              }`}
              title="Chi tiết cuộc trò chuyện"
            >
              <FaInfoCircle />
            </button>
          )}

        </div>
      </div>

      <UserProfileModal
        isOpen={userProfileModal.isOpen}
        user={userProfileModal.user || currentChatUser}
        isGroupChat={isGroupChat}
        getAvatarUrl={getAvatarUrl}
        checkIsOnline={checkIsOnline}
        onClose={handleCloseUserProfileModal}
        onCall={handleCall}
        onUnfriend={handleProfileUnfriend}
      />

      <ConfirmationModal
        isOpen={removeFriendModal.isOpen}
        title="Hủy kết bạn?"
        message={`Bạn có chắc muốn hủy kết bạn với ${getUserDisplayName(removeFriendModal.targetUser || currentChatUser)} không?`}
        type="danger"
        confirmText="Hủy kết bạn"
        cancelText="Đóng"
        isDangerous
        isLoading={removeFriendModal.isLoading}
        onConfirm={handleConfirmRemoveFriend}
        onCancel={handleCloseRemoveFriendModal}
      />

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
          {/* Hiển thị Loader */}
          {isLoadingMore && (
            <div className="flex flex-col items-center justify-center py-4 bg-transparent">
              <div className="scale-[0.3] origin-center h-12 flex items-center justify-center">
                <Loader />
              </div>
            </div>
          )}

          {/* hiển thị hình với tên như ở fb khi chưa chat */}
          {Array.isArray(messages) &&
            messages.length === 0 &&
            !isChatBootstrapping && (
              <div className="flex flex-col items-center mt-16 opacity-80">
                <img
                  src={getAvatarUrl(currentChatUser.avatar)}
                  className="w-16 h-16 rounded-full mb-3 shadow"
                  alt="avatar"
                />

                <h2 className="text-gray-800 font-semibold">
                  {getUserDisplayName(currentChatUser)}
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                  Bắt đầu cuộc trò chuyện bằng những câu chuyện hay!
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
            const isCallLogMessage = message.type === "call_log";

            const isSending = message.status === "sending";
            const isError = message.status === "error";
            const retryCount = message.retryCount || 0;
            const isMaxRetry = retryCount >= 3;
            const uniqueKey = message._id || `temp-${index}`;

            // 2. RENDER: TIN NHẮN HỆ THỐNG
            if (isSystemMessage) {
              return (
                <div key={uniqueKey} className="flex justify-center my-4">
                  <div className="bg-gray-200 text-gray-600 text-xs px-4 py-1 rounded-full flex items-center shadow-sm">
                    {message.text ? message.text.replace(/^\s+/, "").replace(/\s+$/, "") : ""}
                  </div>
                </div>
              );
            }

            // 3. RENDER: BONG BÓNG LỊCH SỬ CUỘC GỌI
            if (isCallLogMessage) {
              return (
                <div key={uniqueKey}>
                  <CallLogItem
                    log={message}
                    currentUser={currentUser}
                    chatPartner={currentChatUser}
                    onRecall={(_, callType) => handleCall(callType)}
                  />
                  <div className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left ml-10"}`}>
                    {formatTimeAgo(message.createdAt)}
                  </div>
                </div>
              );
            }

            // 4. RENDER: TIN NHẮN CHAT BÌNH THƯỜNG (MẶC ĐỊNH)
            return (
              <div key={uniqueKey}>
                {/* Tên người gửi trong Group */}
                {isGroup && !isMe && senderInfo && (
                  <div className="flex items-center ml-2 mb-1">
                    <span className="text-xs font-semibold text-gray-600">
                      {senderName}
                    </span>
                  </div>
                )}

                <div className={`flex ${isMe ? "justify-end" : ""}`}>
                  {/* Avatar người gửi (Chat 1-1) */}
                  {!isMe && !isGroup && (
                    <img
                      src={getAvatarUrl(activeChat.avatar)}
                      className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                      alt="avt"
                    />
                  )}

                  {/* Avatar người gửi (Group Chat) */}
                  {!isMe && isGroup && (
                    <img
                      src={getAvatarUrl(senderAvatar)}
                      className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                      alt="avt"
                    />
                  )}

                  {/* Nội dung Bong bóng chat */}
                  <div
                    className={`p-3 max-w-xs w-fit shadow-sm text-sm transition-opacity duration-300 ${isMe
                      ? "bg-green-600 text-white rounded-l-2xl rounded-br-2xl"
                      : "bg-white text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl"
                      } ${isSending ? "opacity-70" : "opacity-100"} ${isError ? "border-2 border-red-400" : ""
                      }`}
                  >
                    {/* Files đính kèm */}
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
                              <span className="truncate">{file.originalName}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Text tin nhắn */}
                    {message.text && (
                      <div className="break-words overflow-hidden whitespace-pre-wrap leading-relaxed">
                        {renderMessageTextWithLinks(message.text, isMe)}
                      </div>
                    )}

                    {/* Trạng thái gửi / Lỗi / Đã xem */}
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
                            {!isGroup &&
                              (message.isRead ? (
                                <FaCheckDouble className="text-xs text-green-200 inline-block" />
                              ) : (
                                <FaCheck className="text-xs text-green-200 inline-block" />
                              ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Những người đã xem trong group */}
                {isMe && isGroup && message.readBy && message.readBy.length > 0 && (() => {
                  const fullViewersData = message.readBy.map((reader) => {
                    const readerId = typeof reader === "object" ? reader._id : reader;
                    const userObj =
                      activeChat?.members?.find((m) => m._id === readerId) ||
                      users.find((u) => u._id === readerId);
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

                {/* Thời gian gửi */}
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
        </div>
      </div>
    </>
  );
};

export default ChatWindow;
