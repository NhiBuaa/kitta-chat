import { useState, useEffect } from "react";
import { FaTimes, FaUserPlus } from "react-icons/fa";
import axios from "axios";
import { toast } from "react-toastify";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";

const AddMemberModal = ({ isOpen, onClose, group, onAddSuccess }) => {
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [loading, setLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL_USERS || '/api/users';
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (isOpen) {
      loadFriends();
    }
  }, [isOpen]);

  const loadFriends = async () => {
    try {
      const res = await axios.get(`${API_URL}/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const friendsNotInGroup = res.data.friends.filter(
        (friend) => !group.members.some((member) => member._id === friend._id),
      );
      setFriends(friendsNotInGroup);
    } catch (error) {
      console.error("Lỗi tải bạn bè:", error);
      toast.error("Không thể tải danh sách bạn bè");
    }
  };

  const handleAddMember = async () => {
    if (!selectedFriend) {
      toast.warning("Vui lòng chọn bạn bè để thêm");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(
        `/api/groups/${group._id}/add-member`,
        { memberId: selectedFriend._id },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data.success) {
        toast.success("Thêm thành viên thành công");
        setSelectedFriend(null);
        onAddSuccess?.(res.data.group);
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Lỗi thêm thành viên");
    } finally {
      setLoading(false);
    }
  };

  const getAvatarUrl = (avatar) => {
    if (!avatar) return "https://via.placeholder.com/40";
    if (avatar.startsWith("http")) return avatar;
    return `${API_URL}/${avatar}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-96 max-h-96 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FaUserPlus /> Thêm thành viên
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="text-sm">Không có bạn bè nào để thêm</p>
            </div>
          ) : (
            friends.map((friend) => (
              <button
                key={friend._id}
                onClick={() => setSelectedFriend(friend)}
                className={`w-full flex items-center space-x-3 p-3 rounded-lg transition ${
                  selectedFriend?._id === friend._id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                <img
                  src={getAvatarUrl(friend.avatar)}
                  alt={getUserDisplayName(friend)}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="text-left">
                  <p className="text-sm font-medium">
                    {getUserDisplayName(friend)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="border-t p-4 flex gap-2">
          <button
            onClick={handleAddMember}
            className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 font-medium"
            disabled={!selectedFriend || loading}
          >
            {loading ? "Đang thêm..." : "Thêm"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 font-medium"
            disabled={loading}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddMemberModal;
