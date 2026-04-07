import React, { useRef, useEffect } from "react";
import {
  FaImage,
  FaPaperclip,
  FaSmile,
  FaPaperPlane,
  FaTimesCircle,
} from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import { UploadItem } from "../components/UploadItem";
import { FilePicker } from "./FilePicker";

const ChatInput = ({
  showEmoji,
  setShowEmoji,
  onEmojiClick,
  handleSendMessage,
  newMessage,
  handleInputChange,
  uploadQueue,
  addFiles,
  removeUploadItem,
}) => {
  // tự điều chỉnh chiều cao của textarea khi ở 2 mh lớn nhỏ khác nhau
  const textareaRef = useRef(null);
  useEffect(() => {
    const handleResize = () => {
      const el = textareaRef.current;
      if (!el) return;

      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return (
    <div className="bg-white p-4 border-t border-gray-200 relative shrink-0">
      {/* KHU VỰC HIỂN THỊ FILE ĐANG TẢI LÊN */}
      {uploadQueue && uploadQueue.length > 0 && (
        <div className="absolute bottom-20 left-4 bg-white p-3 rounded-lg shadow-xl border border-gray-200 z-50 w-80 max-h-64 overflow-y-auto">
          <div className="text-xs font-bold text-gray-500 mb-2 uppercase">
            Đính kèm:
          </div>
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
        <div className="absolute bottom-20 left-4 z-50 shadow-xl rounded-xl overflow-hidden border border-gray-200">
          <EmojiPicker onEmojiClick={onEmojiClick} />
        </div>
      )}

      {/* FORM NHẬP LIỆU */}
      <form
        onSubmit={handleSendMessage}
        className="flex items-center bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm focus-within:shadow-md focus-within:border-green-400 transition"
      >
        <div className="flex items-center">
          {/* icon gui ảnh */}
          <FilePicker onFilesSelected={addFiles} accept="image/*">
            <button
              type="button"
              title="Gửi ảnh"
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-500 transition transform hover:scale-110"
            >
              <FaImage size={16} />
            </button>
          </FilePicker>

          {/* Bọc icon File bằng FilePicker */}
          <FilePicker onFilesSelected={addFiles} accept="*/*">
            <button
              type="button"
              title="Gửi file"
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-500 transition transform hover:scale-110"
            >
              <FaPaperclip size={16} />
            </button>
          </FilePicker>
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-500 transition transform hover:scale-110"
          >
            <FaSmile size={16} />
          </button>
        </div>

        <textarea
          rows={1}
          ref={textareaRef}
          placeholder="Nhập tin nhắn..."
          //gõ quá dài thì sẽ tăng h, dài quá thì có thể cuộn
          className="flex-1 self-center bg-transparent focus:outline-none text-sm px-2 leading-[20px] resize-none overflow-y-auto max-h-[80px] break-all"
          value={newMessage}
          onChange={(e) => {
            handleInputChange(e);
            setShowEmoji(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault(); //chặn xún dòng khi enter shift
              handleSendMessage(e);
            }
          }}
          onInput={(e) => {
            e.target.style.height = "20px";
            e.target.style.height = e.target.scrollHeight + "px"; //tự tăng chièu cao
          }}
          style={{
            height: "20px",
          }}
        />
        {/* nut gui  */}
        <button
          type="submit"
          disabled={!newMessage.trim() && uploadQueue.length === 0}
          className={`ml-3 w-9 h-9 flex items-center justify-center rounded-full shadow transition transform
    ${
      newMessage.trim() || uploadQueue.length > 0
        ? "bg-green-500 hover:bg-green-600 text-white hover:scale-110"
        : "bg-gray-300 text-gray-400 cursor-not-allowed"
    }`}
        >
          <FaPaperPlane size={16} />
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
