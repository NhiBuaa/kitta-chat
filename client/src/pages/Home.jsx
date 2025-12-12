import { useState, useEffect, useRef } from "react";
import { FaSearch, FaPaperPlane, FaPhone, FaVideo, FaInfoCircle, FaSmile, FaCommentDots } from "react-icons/fa";
import UserProfileSidebar from "../components/UserProfileSidebar";
import { io } from "socket.io-client";
import axios from "axios";
import UserStatus from "../components/UserStatus";
import { formatTimeAgo } from "../utils/formatTime";

const Home = () => {
    // STATE
    const [activeChat, setActiveChat] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [onlineUserIds, setOnlineUserIds] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const scrollRef = useRef();
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

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

    // LẮNG NGHE TIN NHẮN ĐẾN
    useEffect(() => {
        if (!socket.current) return;

        socket.current.on("getMessage", (data) => {
            // Chỉ hiện tin nhắn nếu nó đến từ người mình đang chat (activeChat)
            if (activeChat && data.senderId === activeChat._id) {
                setMessages((prev) => [...prev, {
                    sender: data.senderId,
                    text: data.text,
                    createdAt: data.createdAt
                }]);
            }
        });
    }, [activeChat]);

    // LẤY TIN NHẮN TỪ DB KHI CHỌN NGƯỜI CHAT
    useEffect(() => {
        const getMessages = async () => {
            if (!activeChat || !currentUser) return;
            try {
                const res = await axios.get(`${API_URL}/api/messages/${currentUser._id}/${activeChat._id}`);
                setMessages(res.data);
            } catch (err) {
                console.log(err);
            }
        };
        getMessages();
    }, [activeChat, currentUser]);

    // TỰ ĐỘNG CUỘN XUỐNG DƯỚI
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // HÀM GỬI TIN NHẮN
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const messageData = {
            sender: currentUser._id,
            receiver: activeChat._id,
            text: newMessage
        };

        // Gửi qua Socket để bên kia nhận ngay lập tức
        socket.current.emit("sendMessage", {
            senderId: currentUser._id,
            receiverId: activeChat._id,
            text: newMessage
        });

        try {
            // Lưu vào DB
            const res = await axios.post(`${API_URL}/api/messages`, messageData);
            // Cập nhật UI của mình
            setMessages([...messages, res.data]);
            setNewMessage(""); // Xóa ô nhập
        } catch (err) {
            console.log(err);
        }
    };

    // LẮNG NGHE SỰ KIỆN TYPING TỪ NGƯỜI KHÁC
    useEffect(() => {
        if (!socket.current) return;

        // Khi nhận tin hiệu đang gõ
        socket.current.on("getTyping", (senderId) => {
            // Chỉ hiện nếu đúng là người mình đang chat gửi tín hiệu
            if (activeChat && senderId === activeChat._id) {
                setIsTyping(true);
            }
        });

        // Khi nhận tín hiệu ngừng gõ
        socket.current.on("getStopTyping", (senderId) => {
            if (activeChat && senderId === activeChat._id) {
                setIsTyping(false);
            }
        });

    }, [activeChat]);

    // Reset trạng thái typing khi chuyển chat sang người khác
    useEffect(() => {
        setIsTyping(false);
    }, [activeChat]);


    // HÀM XỬ LÝ KHI MÌNH GÕ PHÍM
    const handleInputChange = (e) => {
        setNewMessage(e.target.value);

        if (!socket.current || !activeChat) return;

        // Nếu chưa gửi tín hiệu typing thì gửi đi
        // (Logic này giúp không spam socket liên tục mỗi lần gõ 1 ký tự)
        socket.current.emit("typing", { receiverId: activeChat._id });

        // Xóa timeout cũ nếu người dùng vẫn đang gõ liên tục
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        // Set timeout mới: Nếu sau 2 giây không gõ gì thêm -> Gửi stopTyping
        typingTimeoutRef.current = setTimeout(() => {
            socket.current.emit("stopTyping", { receiverId: activeChat._id });
        }, 2000);
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
                    {filteredUsers.length > 0 ? (
                        // TRƯỜNG HỢP CÓ DỮ LIỆU
                        filteredUsers.map((user) => {
                            const isOnline = checkIsOnline(user);

                            return (
                                <div
                                    key={user._id}
                                    onClick={() => setActiveChat(user)}
                                    className="p-4 flex items-center border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition"
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
                        })
                    ) : (
                        // TRƯỜNG HỢP KHÔNG CÓ DỮ LIỆU (Empty State)
                        <div className="flex flex-col items-center justify-center mt-10 text-gray-400">
                            <div className="bg-gray-100 p-4 rounded-full mb-3">
                                <FaSearch size={24} className="text-gray-300" />
                            </div>
                            <p className="text-sm">Không tìm thấy người dùng nào</p>
                            {searchTerm && <p className="text-xs mt-1">Kết quả cho: "{searchTerm}"</p>}
                        </div>
                    )}
                </div>
            </div>

            {/* --- CHAT WINDOW --- */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
                            <div className="flex items-center">
                                <img
                                    src={getAvatarUrl(activeChat.avatar)}
                                    className="w-11 h-11 rounded-full mr-3 object-cover border border-gray-200"
                                    alt="avatar"
                                />
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
                            {messages.map((m, index) => {
                                const isMe = m.sender === currentUser._id;

                                return (
                                    <div key={index} ref={scrollRef}>
                                        <div className={`flex ${isMe ? 'justify-end' : ''}`}>

                                            {/* Avatar của người khác (chỉ hiện khi không phải là mình) */}
                                            {!isMe && (
                                                <img
                                                    src={getAvatarUrl(activeChat.avatar)}
                                                    className="w-8 h-8 rounded-full mr-2 mt-1 object-cover"
                                                    alt="avt"
                                                />
                                            )}

                                            <div className={`p-3 max-w-xs shadow-sm text-sm ${isMe
                                                ? 'bg-green-600 text-white rounded-l-2xl rounded-br-2xl'
                                                : 'bg-white text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl'
                                                }`}>
                                                {m.text}
                                            </div>
                                        </div>
                                        <div className={`text-[10px] text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left ml-10'}`}>
                                            {formatTimeAgo(m.createdAt)}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Dòng này giúp tin nhắn mới không bị che khi mới vào */}
                            {messages.length === 0 && (
                                <p className="text-center text-gray-400 text-sm mt-10">
                                    Hãy bắt đầu cuộc trò chuyện với {activeChat.displayName}
                                </p>
                            )}

                            {/* HIỂN THỊ ANIMATION TYPING */}
                            {isTyping && (
                                <div className="flex items-center ml-2 mt-2" ref={scrollRef}>
                                    <img
                                        src={getAvatarUrl(activeChat.avatar)}
                                        className="w-6 h-6 rounded-full mr-2 object-cover"
                                        alt="typing-avt"
                                    />
                                    <div className="bg-gray-200 p-3 rounded-2xl rounded-tl-none flex items-center space-x-1 w-16 h-9">
                                        {/* 3 dấu chấm nhảy múa dùng Tailwind animate-bounce */}
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="bg-white p-4 border-t border-gray-200">
                            <form onSubmit={handleSendMessage} className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                                <button type="button" className="text-gray-500 hover:text-green-600 mr-3"><FaSmile size={20} /></button>

                                <input
                                    type="text"
                                    placeholder="Nhập tin nhắn..."
                                    className="flex-1 bg-transparent focus:outline-none"
                                    value={newMessage}
                                    onChange={handleInputChange}
                                />

                                <button type="submit" className="text-green-600 hover:text-green-800 ml-3">
                                    <FaPaperPlane size={20} />
                                </button>
                            </form>
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