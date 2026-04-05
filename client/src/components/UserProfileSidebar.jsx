import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import imageCompression from "browser-image-compression";
const API_URL = import.meta.env.VITE_API_URL;
const UserProfileSidebar = ({ isOpen, onClose, user, onUpdateSuccess }) => {
  const URL_UPDATE_PROFILE = `${API_URL}/api/users/profile`;
  const defaultAvatar = import.meta.env.VITE_DEFAULT_AVATAR;
  // Khởi tạo state cho form
  const [formData, setFormData] = useState({
    displayName: "",
    status: "",
    isOnline: true,
    avatarPreview: "",
    avatarFile: null,
  });

  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const getAvatarUrl = (avatar) => {
    if (!avatar) return defaultAvatar;
    if (avatar.startsWith("http")) return avatar;
    return `${API_URL}/${avatar.replace(/^\/+/, "")}`;
  };

  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        displayName: user.displayName || "",
        status: user.status || "",
        isOnline:
          user.activityStatus?.state === "online" ||
          user.activityStatus?.state === "active",
        avatarPreview: getAvatarUrl(user.avatar),
        avatarFile: null,
      });
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Xử lý khi người dùng nhập liệu
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Kiểm tra xem có phải là ảnh không
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ chấp nhận định dạng ảnh.");
      return;
    }

    try {
      // Thực hiện resize ảnh
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        typeFile: "image/webp",
      };

      // Nén
      const compressedFile = await imageCompression(file, options);

      setFormData((prev) => ({
        ...prev,
        avatarFile: compressedFile,
        avatarPreview: URL.createObjectURL(compressedFile),
      }));
    } catch (err) {
      console.error("Lỗi upload avatar: ", err);
      toast.error("Không thể xử lý hình ảnh này!");
    }
  };

  const handlesSave = async () => {
    try {
      setLoading(true);

      // Chuẩn bị FormData
      const dataPayload = new FormData();
      dataPayload.append("displayName", formData.displayName);
      dataPayload.append("status", formData.status);

      // Xử lý status online/offline
      const activityStatus = {
        state: formData.isOnline ? "online" : "offline",
        lastSeen: new Date(),
      };
      dataPayload.append("activityStatus", JSON.stringify(activityStatus));

      // Chỉ gửi avatar nếu người dùng CÓ chọn file mới
      if (formData.avatarFile) {
        dataPayload.append("avatar", formData.avatarFile);
      }

      // Lấy Token
      const token = localStorage.getItem("token");

      // Gọi API
      // Thay URL bằng địa chỉ Backend thực tế của bạn
      const res = await axios.put(URL_UPDATE_PROFILE, dataPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (res.data.success) {
        toast.success("Cập nhật hồ sơ thành công!");
        // Gọi callback để Home cập nhật lại UI ngay lập tức
        if (onUpdateSuccess) onUpdateSuccess(res.data.user);
      }
    } catch (error) {
      console.error("Lỗi update:", error);
      toast.error(
        error.response?.data?.message || "Có lỗi xảy ra khi cập nhật hồ sơ.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      ></div>

      {/*Sidebar*/}
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col">
        {/* HEADER CỦA SIDEBAR */}
        <div className="h-32 bg-blue-600 relative flex items-center justify-center">
          {/* Nút đóng */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200 text-2xl font-bold focus:outline-none"
          >
            {" "}
            &times;{" "}
          </button>

          {/* Avatar nằm đè lên ranh giới */}
          <div className="absolute -bottom-10 relative group">
            {/* Avatar */}
            <img
              src={formData.avatarPreview || defaultAvatar}
              alt="Avatar"
              className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg bg-gray-200"
            />

            {/* CHẤM XANH ONLINE */}
            {formData.isOnline && (
              <div className="absolute bottom-1 right-3 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
            )}

            {/* Overlay đổi ảnh */}
            <label
              htmlFor="upload-avatar"
              className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <span className="text-white text-xs font-bold">Đổi ảnh</span>
            </label>

            {/* Input File Ẩn */}
            <input
              id="upload-avatar"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>
        </div>

        {/* BODY CỦA SIDEBAR */}
        <div className="mt-4 px-6 py-4 flex-grow overflow-y-auto">
          <h2 className="text-xl font-bold text-center text-gray-800">
            {user.displayName}
          </h2>
          <p
            className={`text-center text-sm mb-6 font-medium ${formData.isOnline ? "text-blue-600" : "text-gray-500"}`}
          >
            {formData.isOnline
              ? "Đang bật trạng thái hoạt động"
              : "Đang tắt trạng thái hoạt động"}
          </p>

          {/* Form chỉnh sửa nhanh */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên hiển thị
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => handleChange("displayName", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                rows="3"
                value={formData.status}
                onChange={(e) => handleChange("status", e.target.value)}
                placeholder="Hãy viết gì đó..."
              ></textarea>
            </div>

            {/* Toggle Online/Offline */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Trạng thái hoạt động
              </label>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => handleChange("isOnline", true)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                    formData.isOnline
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Bật trạng thái hoạt động
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                    !formData.isOnline
                      ? "bg-white text-gray-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Tắt trạng thái hoạt động
                </button>
              </div>
            </div>
          </div>

          {/* FOOTER CỦA SIDEBAR */}
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handlesSave}
              disabled={loading}
              className={`w-full py-2.5 px-4 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </div>
      {/* xác nhận tắt trạng thái hoạt động  */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          {/* nền mờ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowConfirm(false)}
          />

          {/* box */}
          <div className="relative bg-white rounded-xl p-6 w-80 shadow-xl">
            <p className="font-semibold text-gray-800 mb-2">
              Tắt trạng thái hoạt động?
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Khi tắt, bạn bè sẽ không thấy bạn hoạt động và bạn sẽ không thể
              thấy họ hoạt động.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Hủy
              </button>

              <button
                onClick={() => {
                  handleChange("isOnline", false);
                  setShowConfirm(false);
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfileSidebar;
