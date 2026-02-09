import { useEffect, useState } from 'react';
import axios from 'axios';
import { FaTimes, FaUserCheck, FaUserTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';

const API_URL = import.meta.env.VITE_API_URL_USERS || 'http://localhost:3000/api/users';

const FriendRequestModal = ({ onClose, onSuccess, setRequestCount }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    // 1. Lấy danh sách lời mời khi mở Modal
    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/friend-requests`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success) {
                    setRequests(res.data.requests);
                    // Cập nhật requestCount ngay khi mở modal
                    if (setRequestCount) {
                        setRequestCount(res.data.requests.length);
                    }
                }
            } catch (error) {
                console.error("Lỗi lấy lời mời:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset requestCount khi modal đóng
    const handleClose = () => {
        if (setRequestCount) {
            setRequestCount(requests.length);
        }
        onClose();
    };

    // Cập nhật requestCount mỗi khi requests thay đổi
    useEffect(() => {
        if (setRequestCount) {
            setRequestCount(requests.length);
        }
    }, [requests, setRequestCount]);

    // 2. Xử lý Đồng ý kết bạn
    const handleAccept = async (senderId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/accept-friend`,
                { senderId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Xóa người vừa đồng ý khỏi danh sách
            setRequests((prev) => prev.filter((req) => req._id !== senderId));

            if (onSuccess) onSuccess();

        } catch (error) {
            console.error("Lỗi đồng ý lời mời:", error);
            toast.error(error.response?.data?.message || "Lỗi kết nối");
        }
    };

    // Xử lý Từ chối
    const handleReject = async (senderId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/reject-friend`,
                { senderId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Xoá nguời vừa từ chối khỏi danh sách
            setRequests((prev) => prev.filter((req) => req._id !== senderId));

            if (onSuccess) onSuccess();

        } catch (error) {
            console.error("Lỗi từ chối lời mời:", error);
            toast.error(error.response?.data?.message || "Lỗi kết nối");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden transform transition-all scale-100">

                {/* Header Modal */}
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800">Lời mời kết bạn</h3>
                    <button onClick={handleClose} className="text-gray-400 hover:text-red-500 transition">
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Body List */}
                <div className="p-4 max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="text-center py-4 text-gray-500">Đang tải...</div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-8 flex flex-col items-center">
                            <div className="bg-gray-100 p-3 rounded-full mb-2">
                                <FaUserTimes size={24} className="text-gray-400" />
                            </div>
                            <p className="text-gray-500 text-sm">Hiện không có lời mời nào.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {requests.map((user) => (
                                <div key={user._id} className="flex items-center justify-between bg-white p-2 hover:bg-gray-50 rounded-lg border border-gray-100 shadow-sm transition">
                                    <div className="flex items-center space-x-3">
                                        <img
                                            src={user.avatar}
                                            alt="Avt"
                                            className="w-10 h-10 rounded-full object-cover border border-gray-200"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">{user.displayName}</p>
                                            <p className="text-xs text-gray-500">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => handleAccept(user._id)}
                                            className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition"
                                            title="Đồng ý"
                                        >
                                            <FaUserCheck size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleReject(user._id)}
                                            className="p-2 bg-red-100 text-red-500 rounded-full hover:bg-red-200 transition"
                                            title="Xóa"
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