import React from "react";
import { FaImage, FaPaperclip, FaSmile, FaPaperPlane, FaTimesCircle } from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import { UploadItem } from "../components/UploadItem";
import { FilePicker } from "./FilePicker"

const ChatInput = ({
    showEmoji,
    setShowEmoji,
    onEmojiClick,
    handleSendMessage,
    newMessage,
    handleInputChange,
    uploadQueue,
    addFiles,
    removeUploadItem
}) => {
    return (
        <div className="bg-white p-4 border-t border-gray-200 relative shrink-0">

            {/* KHU VỰC HIỂN THỊ FILE ĐANG TẢI LÊN */}
            {uploadQueue && uploadQueue.length > 0 && (
                <div className="absolute bottom-20 left-4 bg-white p-3 rounded-lg shadow-xl border border-gray-200 z-50 w-80 max-h-64 overflow-y-auto">
                    <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Đính kèm:</div>
                    {uploadQueue.map((item) => (
                        <div key={item.id} className="relative mb-2 pr-2">
                            <UploadItem item={item} />

                            {/* Nút Xóa File */}
                            <button
                                type="button"
                                onClick={() => removeUploadItem(item.id)}
                                className="absolute top-1 right-0 bg-gray-100 text-red-500 rounded-full p-1 hover:bg-red-100 transition"
                            >
                                <FaTimesCircle size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* KHU VỰC HIỂN THỊ EMOJI */}
            {showEmoji && (
                <div className="absolute bottom-20 left-4 z-10 shadow-xl rounded-lg overflow-hidden">
                    <EmojiPicker onEmojiClick={onEmojiClick} />
                </div>
            )}

            {/* FORM NHẬP LIỆU */}
            <form onSubmit={handleSendMessage} className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                <div className="flex items-center gap-3">
                    <FilePicker onFilesSelected={addFiles} accept="image/*">
                        <button type="button" title="Gửi ảnh" className="text-gray-500 hover:text-green-500 transition">
                            <FaImage size={18} />
                        </button>
                    </FilePicker>

                    {/* Bọc icon File bằng FilePicker */}
                    <FilePicker onFilesSelected={addFiles} accept="*/*">
                        <button type="button" title="Gửi tài liệu" className="text-gray-500 hover:text-green-500 transition">
                            <FaPaperclip size={18} />
                        </button>
                    </FilePicker>
                    <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="text-gray-500 hover:text-yellow-500 mr-3 transition">
                        <FaSmile size={18} />
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 bg-transparent focus:outline-none"
                    value={newMessage}
                    onChange={handleInputChange}
                />
                <button type="submit" className="text-green-800 hover:text-green-800 ml-3 transition transform hover:scale-110">
                    <FaPaperPlane size={18} />
                </button>
            </form>
        </div>
    );
};

export default ChatInput;