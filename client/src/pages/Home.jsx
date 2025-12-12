import { useState, useEffect, useRef } from "react";
import { FaSearch, FaPaperPlane, FaPhone, FaVideo, FaInfoCircle, FaSmile, FaCommentDots } from "react-icons/fa";
import UserProfileSidebar from "../components/UserProfileSidebar";
import { io } from "socket.io-client";
import axios from "axios";
import UserStatus from "../components/UserStatus";

const Home = () => {
    // STATE
    const [activeChat, setActiveChat] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [onlineUserIds, setOnlineUserIds] = useState([]);

    // BIẾN
    const API_URL = import.meta.env.VITE_API_URL
    const socket = useRef();

    // Lấy dữ liệu users từ DB
    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    window.location.href = '/login';
                    return;
                }

                const config = { headers: { Authorization: `Bearer ${token}` } };

                // Gọi song song 2 API: Lấy Profile mình & Lấy list Users
                const [profileRes, usersRes] = await Promise.all([
                    axios.get(`${API_URL}/api/users/profile`, config),
                    axios.get(`${API_URL}/api/users`, config)
                ]);

                // Xử lý Profile
                if (profileRes.data.success) {
                    setCurrentUser(profileRes.data.user);
                }

                // Xử lý List Users
                if (usersRes.data.success) {
                    setUsers(usersRes.data.users);
                }

            } catch (error) {
                console.error("Lỗi tải dữ liệu:", error);
                if (error.response?.status === 401) {
                    localStorage.removeItem("token");
                    window.location.href = '/login';
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const getAvatarUrl = (avatarPath) => {
        if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
        if (avatarPath.startsWith('http')) return avatarPath;
        return `${API_URL}${avatarPath}`;
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        window.location.reload();
    };

    const handleUpdateSuccess = (updatedUser) => {
        setCurrentUser(updatedUser);
    };

    //Lọc theo displayName
    const filteredUsers = users.filter(user =>
        (user.displayName || user.email).toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Kết nối socket.io
    useEffect(() => {
        if (currentUser) {
            // Kết nối tới server và gửi userId của mình
            socket.current = io(API_URL, {
                query: { userId: currentUser._id } // Gửi ID để server biết ai đang connect
            });

            // Lắng nghe sự kiện từ server trả về danh sách người đang online
            socket.current.on("getOnlineUsers", (userIds) => {
                setOnlineUserIds(userIds);
            });
        }

        // Ngắt kết nối khi thoát trang
        return () => {
            if (socket.current) {
                socket.current.disconnect();
            }
        };
    }, [currentUser]);

    // Kết hợp dữ liệu từ DB (khi mới load) và Socket (realtime)
    const checkIsOnline = (user) => {
        //  Nếu ID có trong danh sách socket -> Chắc chắn đang Online
        if (onlineUserIds.includes(user._id)) return true;

        return false;
    };

    if (isLoading) {
        return <div className="h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">

            {/* --- SIDEBAR --- */}
            <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
                {/* Header Sidebar */}
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-blue-600 text-white relative z-10 shadow-md">

                    {/* Phần bên trái: Avatar + Tên App */}
                    <div className="flex items-center space-x-4">
                        {/* Nút chứa Avatar - Click để mở profile */}
                        <button onClick={() => setShowProfile(true)} className="focus:outline-none group relative" title="Xem và chỉnh sửa hồ sơ">
                            <img src={getAvatarUrl(currentUser?.avatar)} alt="User Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-blue-400 group-hover:border-white cursor-pointer transition-all duration-200" />
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-green-400"></span>
                        </button>

                        <h1 className="text-xl font-bold hidden md:block">Chat App</h1>
                    </div>
                    <button onClick={handleLogout} className="text-xs bg-blue-800 px-3 py-2 rounded hover:bg-blue-900 transition-colors shadow-sm font-semibold"> Logout </button>
                </div>

                {/* Search */}
                <div className="p-4">
                    <div className="relative">
                        <FaSearch className="absolute top-3 left-3 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm người dùng..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* User List */}
                <div className="flex-1 overflow-y-auto">
                    {filteredUsers.map((user) => {
                        // Hàm check Socket Realtime (đã làm ở bước trước)
                        const isOnline = checkIsOnline(user);

                        return (
                            <div
                                key={user._id}
                                onClick={() => setActiveChat(user)}
                                className="p-4 flex items-center border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                            >
                                {/* Phần Avatar */}
                                <div className="relative">
                                    <img src={getAvatarUrl(user.avatar)} alt="Avt" className="w-12 h-12 rounded-full object-cover" />
                                    {isOnline && (
                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                                    )}
                                </div>

                                {/* Phần Info */}
                                <div className="ml-3 flex-1 overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-semibold text-gray-800 text-sm truncate">{user.displayName}</h3>
                                    </div>

                                    <UserStatus user={user} isOnline={isOnline} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- CHAT WINDOW --- */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
                            <div className="flex items-center">
                                <img src={activeChat.avatar} className="w-10 h-10 rounded-full mr-3 object-cover" />
                                <div>
                                    <h3 className="font-bold text-gray-800">{activeChat.displayName}</h3>

                                    <div>
                                        <UserStatus
                                            user={activeChat}
                                            isOnline={checkIsOnline(activeChat)}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex space-x-4 text-blue-600">
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaPhone /></button>
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaVideo /></button>
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaInfoCircle /></button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* Tin nhắn người khác */}
                            <div className="flex">
                                <img src={activeChat.avatar} className="w-8 h-8 rounded-full mr-2 mt-1" />
                                <div className="bg-white p-3 rounded-r-2xl rounded-bl-2xl shadow-sm max-w-xs text-gray-800 border border-gray-100">
                                    Chào bạn, lâu rồi không gặp!
                                </div>
                            </div>

                            {/* Tin nhắn của mình */}
                            <div className="flex justify-end">
                                <div className="bg-blue-600 text-white p-3 rounded-l-2xl rounded-br-2xl shadow-md max-w-xs">
                                    Hi! Mình vẫn khỏe. Dạo này thế nào?
                                </div>
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="bg-white p-4 border-t border-gray-200">
                            <div className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                                <button className="text-gray-500 hover:text-blue-600 mr-3"><FaSmile size={20} /></button>
                                <input type="text" placeholder="Nhập tin nhắn..." className="flex-1 bg-transparent focus:outline-none" />
                                <button className="text-blue-600 hover:text-blue-800 ml-3"><FaPaperPlane size={20} /></button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <FaPaperPlane size={40} className="text-gray-400 ml-2" />
                        </div>
                        <p className="text-lg">Chọn một cuộc trò chuyện để bắt đầu</p>
                    </div>
                )}
            </div>
            {showProfile && (
                <UserProfileSidebar
                    isOpen={showProfile}
                    user={{
                        ...currentUser,
                        avatar: getAvatarUrl(currentUser?.avatar)
                    }}
                    onClose={() => setShowProfile(false)}
                    onUpdateSuccess={handleUpdateSuccess}
                />
            )}
        </div>
    );
};

export default Home;