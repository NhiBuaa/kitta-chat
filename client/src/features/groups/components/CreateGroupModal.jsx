import React, { useState } from "react";
import { toast } from "react-toastify";
import { FaTimes, FaCheck } from "react-icons/fa";
import { FiX, FiCheck, FiUsers } from "react-icons/fi";
import { createGroup } from "@/services/api/groupApi.js";


const CreateGroupModal = ({ isOpen, onClose, users, onCreateSuccess }) => {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  if (!isOpen) return null;

  const toggleMember = (userId) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleCancel = () => {
    if (groupName || selectedMembers.length > 0) {
      setShowConfirm(true); // mở confirm
    } else {
      onClose(); // đóng luôn
    }
  };

  const getAvatarUrl = (avatarPath) => {
    if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
    if (avatarPath.startsWith("http")) return avatarPath;
    return `/uploads${avatarPath}`;
  };

  const handleSubmit = async () => {
    if (!groupName.trim()) return toast.warning("Nhập tên nhóm");
    if (selectedMembers.length < 2)
      return toast.warning("Phải chọn thêm ít nhất 2 thành viên để tạo nhóm");

    setLoading(true);
    try {
      const res = await createGroup({ name: groupName, members: selectedMembers });

      if (res.data.success) {
        toast.success("Tạo nhóm thành công!");
        onCreateSuccess(res.data.group);

        // Reset form fields
        setGroupName("");
        setSelectedMembers([]);

        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Đã xảy ra lỗi trong quá trình tạo nhóm, vui lòng thử lại sau!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">

      <div className="bg-white/95 backdrop-blur rounded-2xl w-full max-w-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col max-h-[85vh]">

        {/* phần đầu */}
        <div className="p-4 flex justify-between items-center bg-emerald-500 text-white">
          <h3 className="font-semibold text-lg tracking-wide">
            Tạo nhóm mới
          </h3>
          {/* <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-red-400 transition"
          >
            <FaTimes />
          </button> */}
        </div>

        <div className="p-4 space-y-5 flex-1 overflow-y-auto">

          {/* Tên nhóm */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Tên nhóm
            </label>
            <input
              type="text"
              className="w-full border border-gray-200 p-2.5 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none transition shadow-sm"
              placeholder="Nhập tên nhóm của bạn..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          {/* thành viên */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Thêm thành viên ({selectedMembers.length})
            </label>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {users.map((user) => (
                <div
                  key={user._id}
                  onClick={() => toggleMember(user._id)}
                  className={`flex items-center p-2.5 rounded-xl cursor-pointer border transition-all duration-200 ${selectedMembers.includes(user._id)
                    ? "bg-emerald-50 border-emerald-400 shadow-sm"
                    : "hover:bg-gray-50 border-gray-200"
                    }`}
                >
                  <img
                    src={getAvatarUrl(user.avatar)}
                    className="w-9 h-9 rounded-full mr-3 object-cover border"
                  />
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    {user.displayName}
                  </span>
                  {selectedMembers.includes(user._id) && (
                    <FaCheck className="text-emerald-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* hủy tạo */}
        <div className="p-4 border-t bg-white/80 backdrop-blur flex gap-3">


          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 rounded-xl font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 hover:text-slate-900 transition"
          >
            Hủy
          </button>

          {/* xác nhận tạo */}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-[2] py-2.5 rounded-xl font-semibold bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all duration-200 disabled:opacity-50 shadow-md"
          >
            {loading ? "Đang tạo..." : "Xác nhận tạo nhóm"}
          </button>
        </div>
      </div>
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-xl p-5 w-[300px] shadow-lg">

            <h3 className="font-semibold text-gray-800 mb-2">
              Xác nhận hủy
            </h3>

            <p className="text-sm text-gray-500 mb-4">
              Dữ liệu bạn đã nhập sẽ bị mất. Bạn có chắc muốn hủy?
            </p>

            <div className="flex gap-2">
              {/* ở lại */}
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
              >
                Ở lại
              </button>

              {/* hủy */}
              <button
                onClick={() => {
                  setShowConfirm(false);
                  // reset dữ liệu
                  setGroupName("");
                  setSelectedMembers([]);
                  onClose();
                }}
                className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white hover:bg-red-600"
              >
                Hủy
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );

};

export default CreateGroupModal;
