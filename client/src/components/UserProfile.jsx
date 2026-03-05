import React, { useState, useEffect } from "react";
import axios from "axios";

const UserProfile = () => {
  // State lưu dữ liệu form
  const [formData, setFormData] = useState({
    displayName: "",
    status: "",
    avatarFile: null, // File gốc để upload
    avatarPreview: "", // URL để hiển thị preview
  });
  const [loading, setLoading] = useState(false);

  // Giả lập load data user ban đầu (thực tế bạn gọi API get profile ở đây)
  useEffect(() => {
    // Ví dụ data lấy từ API

    const initialData = {
      displayName: "User Demo",
      status: "Đang code ReactJS...",
      avatarPreview: "https://via.placeholder.com/150", // Avatar mặc định
    };
    setFormData((prev) => ({ ...prev, ...initialData }));
  }, []);

  // Xử lý khi chọn ảnh
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({
        ...formData,
        avatarFile: file,
        avatarPreview: URL.createObjectURL(file), // Tạo URL tạm để xem trước
      });
    }
  };

  // Xử lý submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Dùng FormData để gửi file lên server
      const data = new FormData();
      data.append("displayName", formData.displayName);
      data.append("status", formData.status);
      if (formData.avatarFile) {
        data.append("avatar", formData.avatarFile);
      }

      // Gọi API (Thay URL bằng endpoint thật của bạn)
      await axios.put("/api/users/profile", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert("Cập nhật thành công!");
    } catch (error) {
      console.error(error);
      alert("Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {/* Card Container */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header với Gradient Green -> Teal */}
        <div className="h-32 bg-gradient-to-r from-green-500 to-teal-500 relative">
          {/* Tiêu đề ẩn hoặc nút back có thể đặt ở đây */}
        </div>

        {/* Phần Avatar (Nằm đè lên header và body) */}
        <div className="relative -mt-16 flex justify-center">
          <div className="relative group">
            <img
              src={formData.avatarPreview}
              alt="Avatar"
              className="w-32 h-32 rounded-full border-4 border-white object-cover shadow-md bg-gray-200"
            />
            {/* Nút camera overlay khi hover */}
            <label
              htmlFor="avatar-upload"
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white font-bold"
            >
              Đổi ảnh
            </label>
            <input
              id="avatar-upload"
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleImageChange}
            />
          </div>
        </div>

        {/* Form nhập liệu */}
        <div className="px-8 pb-8 pt-4">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-1">
            {formData.displayName || "Tên người dùng"}
          </h2>
          <p className="text-center text-gray-500 text-sm mb-6">User Profile</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Input: Tên hiển thị */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tên hiển thị
              </label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                value={formData.displayName}
                onChange={(e) =>
                  setFormData({ ...formData, displayName: e.target.value })
                }
                placeholder="Nhập tên của bạn"
              />
            </div>

            {/* Input: Trạng thái */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trạng thái (Status)
              </label>
              <textarea
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all resize-none"
                rows="3"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                placeholder="Bạn đang nghĩ gì?"
              ></textarea>
            </div>

            {/* Nút Save - Gradient Green -> Teal */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 rounded-lg text-white font-bold shadow-lg
                         bg-gradient-to-r from-green-500 to-teal-500 
                         hover:from-green-600 hover:to-teal-600 
                         transform transition-all active:scale-95 disabled:opacity-70"
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
