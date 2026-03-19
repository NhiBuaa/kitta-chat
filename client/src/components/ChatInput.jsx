import React from "react";
import { FaImage, FaPaperclip, FaSmile, FaPaperPlane } from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";

const ChatInput = ({
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
    return (
        <div className="bg-white p-4 border-t border-gray-200 relative shrink-0">
            {/* --- EMOJI PICKER --- */}
            {showEmoji && (
                <div className="absolute bottom-20 left-4 z-10 shadow-xl rounded-lg overflow-hidden">
                    <EmojiPicker onEmojiClick={onEmojiClick} />
                </div>
            )}

            {/* --- FORM NHẬP TIN NHẮN --- */}
            <form
                onSubmit={handleSendMessage}
                className="flex items-center bg-gray-100 rounded-full px-4 py-2"
            >
                {/* Input Ẩn (Dùng ref để click từ icon) */}
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
                    multiple
                />

                {/* Cụm Nút Đính Kèm */}
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        title="Chọn ảnh để gửi"
                        onClick={() => imageInputRef.current.click()}
                        className="text-gray-500 hover:text-green-600 transition"
                    >
                        <FaImage size={18} />
                    </button>

                    <button
                        type="button"
                        title="Chọn file để gửi"
                        onClick={() => fileInputRef.current.click()}
                        className="text-gray-500 hover:text-green-600 transition"
                    >
                        <FaPaperclip size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowEmoji(!showEmoji)}
                        className="text-gray-500 hover:text-green-600 mr-3 transition"
                    >
                        <FaSmile size={18} />
                    </button>
                </div>

                {/* Ô Nhập Text */}
                <input
                    type="text"
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 bg-transparent focus:outline-none"
                    value={newMessage}
                    onChange={handleInputChange}
                />

                {/* Nút Gửi */}
                <button
                    type="submit"
                    className="text-green-600 hover:text-green-800 ml-3 transition transform hover:scale-110"
                >
                    <FaPaperPlane size={18} />
                </button>
            </form>
        </div>
    );
};

export default ChatInput;