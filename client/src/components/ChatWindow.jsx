import React from "react";
import {
    FaPaperPlane,
    FaPhone,
    FaVideo,
    FaInfoCircle,
    FaSmile,
    FaCheck,
    FaCheckDouble,
    FaTimesCircle,
    FaPaperclip,
    FaImage,
} from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import UserStatus from "./UserStatus";
import { formatTimeAgo } from "../utils/formatTime";

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
    API_URL,
    getAvatarUrl,
    checkIsOnline,
    handleVideoCall,
    setShowGroupMembers,
    handleScrollToBottom,
    // Props cho form chat
    imagePreview,
    clearImage,
    selectedFiles,
    removeFile,
    showEmoji,
    setShowEmoji,
    onEmojiClick,
    handleSendMessage,
    imageInputRef,
    handleImageChange,
    fileInputRef,
    handleFileChange,
    newMessage,
    handleInputChange,
}) => {
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
                            {currentChatUser.displayName || currentChatUser.name}
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
                    {/* Nút Gọi Thoại */}
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
                className="flex-1 overflow-y-auto p-6 space-y-4"
                ref={scrollRef}
                onClick={handleScrollToBottom}
            >
                {messages.map((m, index) => {
                    const senderId =
                        typeof m.sender === "object" ? m.sender?._id : m.sender;
                    const isMe = senderId === currentUser._id;
                    const isGroup = activeChat.members ? true : false;
                    const senderInfo = typeof m.sender === "object" ? m.sender : null;
                    const senderName =
                        senderInfo?.displayName ||
                        senderInfo?.email?.split("@")[0] ||
                        "Người dùng";
                    const senderAvatar = senderInfo?.avatar || activeChat.avatar;
                    const isSystemMessage = m.type === "system";

                    if (isSystemMessage) {
                        return (
                            <div key={index} className="flex justify-center my-4">
                                <div className="bg-gray-200 text-gray-600 text-xs px-4 py-1 rounded-full flex items-center shadow-sm">
                                    {m.text}
                                </div>
                            </div>
                        );
                    }

                    // Regular message rendering
                    return (
                        <div key={index}>
                            {/* Nhóm: Hiển thị tên người gửi nếu không phải tin nhắn của mình */}
                            {isGroup && !isMe && senderInfo && (
                                <div className="flex items-center ml-2 mb-1">
                                    <span className="text-xs font-semibold text-gray-600">
                                        {senderName}
                                    </span>
                                </div>
                            )}

                            <div className={`flex ${isMe ? "justify-end" : ""}`}>
                                {/* Chat 1-1: Chỉ hiển thị avatar cho tin nhắn người khác */}
                                {!isMe && !isGroup && (
                                    <img
                                        src={getAvatarUrl(activeChat.avatar)}
                                        className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                                        alt="avt"
                                    />
                                )}

                                {/* Nhóm: Hiển thị avatar nhỏ cho tin nhắn người khác */}
                                {!isMe && isGroup && (
                                    <img
                                        src={getAvatarUrl(senderAvatar)}
                                        className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                                        alt="avt"
                                    />
                                )}

                                <div
                                    className={`p-3 max-w-xs shadow-sm text-sm ${isMe
                                            ? "bg-green-600 text-white rounded-l-2xl rounded-br-2xl"
                                            : "bg-white text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl"
                                        }`}
                                >
                                    {m.image && (
                                        <img
                                            src={getAvatarUrl(m.image)}
                                            className="w-full h-auto rounded-lg mb-2 cursor-pointer hover:opacity-90"
                                            onClick={() =>
                                                window.open(getAvatarUrl(m.image), "_blank")
                                            }
                                            alt="attachment"
                                        />
                                    )}
                                    {/* Render files nếu có */}
                                    {m.files && m.files.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {m.files.map((fileUrl, i) => (
                                                <a
                                                    key={i}
                                                    href={`${API_URL}${fileUrl}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-xs text-blue-600 underline break-all"
                                                >
                                                    📎 {fileUrl.split("/").pop()}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                    {m.text && <span>{m.text}</span>}
                                    {isMe && (
                                        <div className="self-end mt-1 text-right">
                                            {/* 1-1: use isRead flag. Group: consider readBy array length */}
                                            {!isGroup ? (
                                                m.isRead ? (
                                                    <FaCheckDouble className="text-xs text-blue-200 inline-block" />
                                                ) : (
                                                    <FaCheck className="text-xs text-gray-300 inline-block" />
                                                )
                                            ) : m.readBy && m.readBy.length > 0 ? (
                                                <FaCheckDouble className="text-xs text-blue-200 inline-block" />
                                            ) : (
                                                <FaCheck className="text-xs text-gray-300 inline-block" />
                                            )}
                                        </div>
                                    )}

                                    {/* For group messages sent by me, show the list of reader names when available */}
                                    {isMe &&
                                        isGroup &&
                                        m.readBy &&
                                        m.readBy.length > 0 &&
                                        (() => {
                                            const readerIds = m.readBy.map((r) =>
                                                typeof r === "object" ? r._id : r
                                            );
                                            const readerNames = readerIds.map((id) => {
                                                const member =
                                                    activeChat?.members?.find((mm) => mm._id === id) ||
                                                    users.find((u) => u._id === id);
                                                return (
                                                    member?.displayName ||
                                                    member?.name ||
                                                    "Người dùng"
                                                );
                                            });
                                            return (
                                                <div className="text-[11px] mt-1 text-gray-200/90">
                                                    <span className="text-white/70">Đã xem:</span>{" "}
                                                    <span className="font-medium">
                                                        {readerNames.join(", ")}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                </div>
                            </div>
                            <div
                                className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left ml-10"
                                    }`}
                            >
                                {formatTimeAgo(m.createdAt)}
                            </div>
                        </div>
                    );
                })}

                {/* hiển thị trạng thái đang nhập tin nhắn */}
                {isTyping && (
                    <div className="flex items-center ml-2 mt-2">
                        <img
                            src={getAvatarUrl(
                                activeChat.members ? typingUserAvatar : activeChat.avatar
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
            </div>

            <div className="bg-white p-4 border-t border-gray-200">
                {/* xem hình ảnh trước gửi */}
                {imagePreview && (
                    <div className="absolute bottom-20 left-4 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                        <div className="relative">
                            <img
                                src={imagePreview}
                                alt="preview"
                                className="w-24 h-24 object-cover rounded-md"
                            />
                            <button
                                onClick={clearImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                            >
                                <FaTimesCircle size={12} />
                            </button>
                        </div>
                    </div>
                )}

                {/* xem file trước khi gửi */}
                {selectedFiles.length > 0 && (
                    <div className="absolute bottom-20 left-4 bg-white p-3 rounded-lg shadow-lg border border-gray-200">
                        <div className="flex gap-3 flex-wrap max-w-xs">
                            {selectedFiles.map((item, index) => (
                                <div key={index} className="relative">
                                    {item.file.type.startsWith("image/") ? (
                                        <img
                                            src={item.preview}
                                            alt="preview"
                                            className="w-24 h-24 object-cover rounded-md"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 flex items-center justify-center bg-gray-100 rounded-md text-xs text-center p-2">
                                            📄 {item.file.name}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => removeFile(index)}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                    >
                                        <FaTimesCircle size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* icon */}
                {showEmoji && (
                    <div className="absolute bottom-20 left-4 z-10">
                        <EmojiPicker onEmojiClick={onEmojiClick} />
                    </div>
                )}

                {/* form gửi tin nhắn  */}
                <form
                    onSubmit={handleSendMessage}
                    className="flex items-center bg-gray-100 rounded-full px-4 py-2"
                >
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={imageInputRef}
                        onChange={handleImageChange}
                    />

                    <input
                        type="file"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                        multiple
                    />
                    <div className="flex items-center gap-3">
                        {/* nút gửi ảnh */}
                        <button
                            type="button"
                            title="Chọn ảnh để gửi"
                            onClick={() => imageInputRef.current.click()}
                            className="text-gray-500 hover:text-green-600 transition"
                        >
                            <FaImage size={18} />
                        </button>

                        {/* nút gửi file */}
                        <button
                            type="button"
                            title="Chọn file để gửi"
                            onClick={() => fileInputRef.current.click()}
                            className="text-gray-500 hover:text-green-600 transition"
                        >
                            <FaPaperclip size={18} />
                        </button>

                        {/* gửi emoji  */}
                        <button
                            type="button"
                            onClick={() => setShowEmoji(!showEmoji)}
                            className="text-gray-500 hover:text-green-600 mr-3 transition"
                        >
                            <FaSmile size={18} />
                        </button>
                    </div>

                    {/* chỗ nhập tin nhắn */}
                    <input
                        type="text"
                        placeholder="Nhập tin nhắn..."
                        className="flex-1 bg-transparent focus:outline-none"
                        value={newMessage}
                        onChange={handleInputChange}
                    />
                    <button
                        type="submit"
                        className="text-green-600 hover:text-green-800 ml-3"
                    >
                        <FaPaperPlane size={18} />
                    </button>
                </form>
            </div>
        </>
    );
};

export default ChatWindow;