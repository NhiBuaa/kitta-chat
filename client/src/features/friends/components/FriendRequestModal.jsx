import { useEffect, useState } from "react";
import axios from "axios";
import { FaTimes, FaUserCheck, FaUserTimes } from "react-icons/fa";
import { toast } from "react-toastify";
import { useSocket } from "@/services/socket/SocketContext.js";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";
import { getAccessToken } from "@/services/auth/authSession.js";

const API_URL =
  import.meta.env.VITE_API_URL_USERS || "/api/users";

const FriendRequestModal = ({ onClose, setRequestCount }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const getAvatarUrl = (avatarPath) => {
    if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
    if (avatarPath.startsWith("http")) return avatarPath;
    return `/uploads${avatarPath}`;
  };

  const handleAccept = async (senderId) => {
    try {
      const token = getAccessToken();
      await axios.post(
        `${API_URL}/accept-friend`,
        { senderId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      toast.success("Đã đồng ý lời mời kết bạn!");
      setRequests((prev) => prev.filter((request) => request._id !== senderId));
    } catch (error) {
      console.error("Lỗi đồng ý lời mời:", error);
      toast.error(error.response?.data?.message || "Lỗi kết nối");
    }
  };

  const handleReject = async (senderId) => {
    try {
      const token = getAccessToken();
      await axios.post(
        `${API_URL}/reject-friend`,
        { senderId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRequests((prev) => prev.filter((request) => request._id !== senderId));
    } catch (error) {
      console.error("Lỗi từ chối lời mời:", error);
      toast.error(error.response?.data?.message || "Lỗi kết nối");
    }
  };

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const token = getAccessToken();
        const res = await axios.get(`${API_URL}/friend-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) {
          setRequests(res.data.requests);
          setRequestCount?.(res.data.requests.length);
        }
      } catch (error) {
        console.error("Lỗi lấy lời mời:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [setRequestCount]);

  useEffect(() => {
    if (!socket) return;

    const handleNewFriendRequest = (data) => {
      setRequests((prev) => {
        if (prev.some((request) => request._id === data.senderId)) {
          return prev;
        }

        return [
          {
            _id: data.senderId,
            displayName: data.senderName,
            avatar: data.avatar,
          },
          ...prev,
        ];
      });
    };

    const handleFriendRequestHandled = (data) => {
      setRequests((prev) =>
        prev.filter((request) => request._id !== data.senderId),
      );
    };

    socket.on("newFriendRequest", handleNewFriendRequest);
    socket.on("friendRequestHandled", handleFriendRequestHandled);

    return () => {
      socket.off("newFriendRequest", handleNewFriendRequest);
      socket.off("friendRequestHandled", handleFriendRequestHandled);
    };
  }, [socket]);

  const handleClose = () => {
    setRequestCount?.(requests.length);
    onClose();
  };

  useEffect(() => {
    setRequestCount?.(requests.length);
  }, [requests, setRequestCount]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">

      <div className="bg-white/95 backdrop-blur w-full max-w-md rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.25)] overflow-hidden">
        {/* head */}
        <div className="flex justify-between items-center p-4 bg-emerald-500 text-white">
          <h3 className="text-lg font-semibold tracking-wide">
            Lời mời kết bạn
          </h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-red-400 transition"
          >
            <FaTimes size={16} />
          </button>
        </div>


        {/* giữa  */}
        <div className="p-4 max-h-[450px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-gray-500">Đang tải...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10 flex flex-col items-center">
              <div className="bg-gray-100 p-3 rounded-full mb-3">
                <FaUserTimes size={24} className="text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">
                Hiện không có lời mời nào.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all shadow-sm"
                >
                  <div className="flex items-center space-x-3">
                    <img
                      src={getAvatarUrl(user.avatar)}
                      alt={getUserDisplayName(user)}
                      className="w-11 h-11 rounded-full object-cover border"
                    />
                    <p className="text-sm font-semibold text-gray-800">
                      {getUserDisplayName(user)}
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    {/* nút đồng ý */}
                    <button
                      onClick={() => handleAccept(user._id)}
                      className="p-2 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white transition shadow-sm"
                      title="Đồng ý"
                    >
                      <FaUserCheck size={16} />
                    </button>
                    {/* nút từ chối */}
                    <button
                      onClick={() => handleReject(user._id)}
                      className="p-2 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-400 hover:text-white transition shadow-sm"
                      title="Từ chối"
                    >
                      <FaTimes size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default FriendRequestModal;
