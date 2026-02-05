import { useState, useEffect, useRef } from "react";
import { FaBell, FaSearch, FaPaperPlane, FaPhone, FaUsers, FaVideo, FaInfoCircle, FaSmile, FaCheck, FaCheckDouble, FaImage, FaTimesCircle } from "react-icons/fa";
import UserProfileSidebar from "../components/UserProfileSidebar";
import { io } from "socket.io-client";
import axios from "axios";
import UserStatus from "../components/UserStatus";
import { formatTimeAgo } from "../utils/formatTime";
import { toast } from "react-toastify";
import EmojiPicker from 'emoji-picker-react';
import CreateGroupModal from "../components/CreateGroupModal";
import FriendRequestModal from "../components/FriendRequestModal";
import { getFriends } from "../services/userService";

const Home = () => {
    // STATE
    const [activeChat, setActiveChat] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
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
    const [unreadUsers, setUnreadUsers] = useState([]);
    const [showEmoji, setShowEmoji] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const fileInputRef = useRef();
    const [groups, setGroups] = useState([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);

    // BIẾN
    const API_URL = import.meta.env.VITE_API_URL
    const socket = useRef();

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login';
                return;
            }

            const config = { headers: { Authorization: `Bearer ${token}` } };

            // Gọi song song 2 API: Lấy Profile mình & Lấy list Users
            const [profileRes, sidebarRes] = await Promise.all([
                axios.get(`${API_URL}/api/users/profile`, config),
                axios.get(`${API_URL}/api/users/sidebar-list`, config)
            ]);

            // Xử lý Profile
            if (profileRes.data.success) {
                setCurrentUser(profileRes.data.user);
            }

            // Xử lý List Users
            if (sidebarRes.data.success) {
                const fetchedList = sidebarRes.data.users || sidebarRes.data.friends || [];

                setUsers(fetchedList);

                const initialUnreadUsers = fetchedList
                    .filter(user => user.hasUnread)
                    .map(user => user._id);

                setUnreadUsers(initialUnreadUsers);
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

    // Lấy dữ liệu users từ DB
    useEffect(() => {
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

    // FETCH TIN NHẮN TỪ DB
    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat || !currentUser) return;
            setMessages([]);
            try {
                const isGroup = activeChat.members ? true : false;

                const url = isGroup
                    ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true` // userId1 là 'none' hoặc gì cũng được
                    : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}`;

                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                setMessages(res.data);
            } catch (err) {
                console.error("Lỗi fetch tin nhắn:", err);
            }
        };

        fetchMessages();
    }, [activeChat, currentUser]);

    // Kết hợp dữ liệu từ DB (khi mới load) và Socket (realtime)
    const checkIsOnline = (user) => {
        //  Nếu ID có trong danh sách socket -> Chắc chắn đang Online
        if (onlineUserIds.includes(user._id)) return true;

        return false;
    };

    // LẮNG NGHE TIN NHẮN ĐẾN
    useEffect(() => {
        if (!socket.current) return;

        const handleIncomingMessage = (data) => {
            const isCurrentChat = activeChat && (
                (data.isGroup && data.receiverId === activeChat._id) ||
                (!data.isGroup && data.senderId === activeChat._id)
            );
            if (isCurrentChat) {

                setMessages((prev) => [...prev, {
                    sender: data.senderId,
                    text: data.text,
                    createdAt: data.createdAt,
                    isRead: true
                }]);

                // Gửi lại sự kiện "Đã đọc" ngay lập tức vì đang mở chat
                socket.current.emit("markRead", {
                    senderId: data.senderId,
                    receiverId: currentUser._id
                });

                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
            } else {
                // Thêm vào danh sách chưa đọc
                setUnreadUsers((prev) => {
                    // Nếu ID chưa có thì thêm vào
                    if (!prev.includes(data.senderId)) {
                        return [...prev, data.senderId];
                    }
                    return prev;
                });

                // Tìm tên người gửi
                const sender = users.find(u => u._id === data.senderId);
                const senderName = sender ? sender.displayName : "Ai đó";

                // Hiện thông báo nhỏ góc màn hình
                toast.info(`Tin nhắn mới từ ${senderName}: "${data.text.substring(0, 20)}..."`, {
                    position: "top-right",
                    autoClose: 3000,
                    hideProgressBar: true,
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                    theme: "light",
                });
            }
        };

        // Đăng ký sự kiện
        socket.current.on("getMessage", handleIncomingMessage);

        // Cleanup: Hủy sự kiện cũ khi activeChat thay đổi để tránh memory leak và duplicate tin nhắn
        return () => {
            socket.current.off("getMessage", handleIncomingMessage);
        };

    }, [activeChat, users, currentUser]);

    // HÀM CHỌN NGƯỜI CHAT (Sửa lại để xóa thông báo chưa đọc)
    const handleSelectUser = (user) => {
        // Set người đang chat
        setActiveChat(user);

        // Xóa thông báo chưa đọc của người này
        setUnreadUsers((prev) => prev.filter(id => id !== user._id));
    };

    // TỰ ĐỘNG CUỘN XUỐNG DƯỚI
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // HÀM GỬI TIN NHẮN
    // SỬA HÀM GỬI TIN NHẮN
    const handleSendMessage = async (e) => {
        e.preventDefault();

        // Chỉ gửi nếu có text HOẶC có ảnh
        if (!newMessage.trim() && !imageFile) return;

        let imageUrl = "";

        try {
            // Nếu có ảnh -> Upload trước để lấy URL
            if (imageFile) {
                const formData = new FormData();
                formData.append('image', imageFile);

                const uploadRes = await axios.post(`${API_URL}/api/messages/upload`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: `Bearer ${localStorage.getItem('token')}`
                    }
                });
                imageUrl = uploadRes.data.imageUrl;
            }

            const isGroup = activeChat.members ? true : false;

            // Gửi tin nhắn (kèm text và imageUrl)
            const messagePayload = {
                sender: currentUser._id,
                receiver: activeChat._id,
                text: newMessage,
                image: imageUrl,
                isGroup: isGroup
            };

            // Lưu DB
            const res = await axios.post(`${API_URL}/api/messages`, messagePayload, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const savedMessage = res.data;

            // Gửi Socket
            socket.current.emit("sendMessage", {
                ...messagePayload,
                createdAt: savedMessage.createdAt,
                senderId: currentUser._id,
                receiverId: activeChat._id,
                text: savedMessage.text,
                image: savedMessage.image,
            });

            // Update UI
            setMessages((prev) => [...prev, savedMessage]);

            // Reset form
            setNewMessage("");
            clearImage();
            setShowEmoji(false);

        } catch (err) {
            console.error(err);
            toast.error("Lỗi gửi tin nhắn");
        }
    };

    // LẮNG NGHE SỰ KIỆN TYPING TỪ NGƯỜI KHÁC
    useEffect(() => {
        if (!socket.current) return;

        const handleTyping = (senderId) => {
            // QUAN TRỌNG: Chỉ hiện typing nếu người gửi LÀ người đang chat
            if (activeChat && senderId === activeChat._id) {
                setIsTyping(true);
            }
        };

        const handleStopTyping = (senderId) => {
            if (activeChat && senderId === activeChat._id) {
                setIsTyping(false);
            }
        };

        socket.current.on("getTyping", handleTyping);
        socket.current.on("getStopTyping", handleStopTyping);

        return () => {
            socket.current.off("getTyping", handleTyping);
            socket.current.off("getStopTyping", handleStopTyping);
        };
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

    //  LẮNG NGHE SỰ KIỆN ĐỌC TIN NHẮN
    useEffect(() => {
        if (!socket.current) return;

        socket.current.on("userReadMessages", ({ readerId }) => {
            // Nếu người vừa đọc là người mình đang chat cùng
            if (activeChat && readerId === activeChat._id) {
                // Cập nhật tất cả tin nhắn trong state thành "đã đọc"
                setMessages(prev => prev.map(msg => ({ ...msg, isRead: true })));
            }
        });
    }, [activeChat]);

    // ĐÁNH DẤU ĐÃ ĐỌC
    useEffect(() => {
        if (activeChat && currentUser && messages.length > 0) {
            // Kiểm tra xem tin nhắn cuối cùng có phải của đối phương gửi không?
            const lastMessage = messages[messages.length - 1];

            // Nếu tin nhắn cuối là của người kia gửi VÀ chưa đọc
            if (lastMessage.sender === activeChat._id) { // && !lastMessage.isRead (có thể check thêm ở client)

                // Gửi socket báo server
                socket.current.emit("markRead", {
                    senderId: activeChat._id,
                    receiverId: currentUser._id
                });
            }
        }
    }, [activeChat, messages, currentUser]);

    const onEmojiClick = (emojiObject) => {
        setNewMessage((prev) => prev + emojiObject.emoji);
        // Không tắt bảng vội để người dùng có thể chọn nhiều icon
    };

    // XỬ LÝ CHỌN ẢNH
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file)); // Tạo link xem trước
        }
    };

    // XÓA ẢNH ĐANG CHỌN
    const clearImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // FETCH GROUPS
    useEffect(() => {
        const fetchGroups = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/api/groups`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success) setGroups(res.data.groups);
            } catch (error) { console.error(error); }
        };
        fetchGroups();
    }, []);

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

                    {/* Button tạo nhóm */}
                    <button onClick={() => setShowCreateGroup(true)} className="ml-2 text-white hover:text-blue-200">
                        <FaUsers size={20} title="Tạo nhóm" />
                    </button>
                    <button onClick={() => setShowRequestModal(true)} title="Lời mời kết bạn">
                        <FaBell size={20} className="ml-4 text-white hover:text-blue-200" />
                    </button>
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

                <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Nhóm chat</div>
                {groups.map(group => (
                    <div key={group._id} onClick={() => setActiveChat(group)} className="...">
                        {/* Render Avatar Group và Tên Group */}
                        <div className="relative">
                            <img src={group.avatar} className="w-12 h-12 rounded-full" />
                        </div>
                        <div className="ml-3">
                            <h3 className="font-bold">{group.name}</h3>
                            <p className="text-xs text-gray-500">{group.members.length} thành viên</p>
                        </div>
                    </div>
                ))}

                <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Tin nhắn riêng</div>
                {/* User List Container */}
                <div className="flex-1 overflow-y-auto">
                    {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => {
                            const isOnline = checkIsOnline(user);
                            const hasUnread = unreadUsers.includes(user._id);

                            return (
                                <div
                                    key={user._id}
                                    onClick={() => handleSelectUser(user)}
                                    className={`p-4 flex items-center border-b border-gray-50 cursor-pointer transition
                        ${hasUnread ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}
                    `}
                                >
                                    {/* --- Avatar & Online Status --- */}
                                    <div className="relative">
                                        <img
                                            src={getAvatarUrl(user.avatar)}
                                            alt={user.displayName}
                                            className="w-12 h-12 rounded-full object-cover border border-gray-200"
                                        />
                                        {isOnline && (
                                            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>
                                        )}
                                    </div>

                                    {/* --- User Info & Preview --- */}
                                    <div className="ml-3 flex-1 overflow-hidden">
                                        <div className="flex justify-between items-center">
                                            <h3 className={`text-sm truncate max-w-[140px] ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                                {user.displayName}
                                            </h3>
                                            {/* Thời gian tin nhắn cuối (Nếu bạn có trả về từ API) */}
                                            {/* <span className="text-xs text-gray-400">12:30</span> */}
                                        </div>

                                        <div className="flex justify-between items-center mt-1">
                                            <div className="flex-1 text-xs text-gray-500 truncate">
                                                {/* Thay vì hiện UserStatus, Zalo thường hiện tin nhắn cuối cùng */}
                                                {hasUnread ? (
                                                    <span className="text-blue-600 font-semibold">Bạn có tin nhắn mới</span>
                                                ) : (
                                                    <span className="text-gray-400">Nhấn để bắt đầu trò chuyện</span>
                                                )}
                                            </div>

                                            {/* Badge số lượng tin chưa đọc */}
                                            {hasUnread && (
                                                <div className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                                                    N
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-4">
                            <div className="bg-blue-50 p-4 rounded-full mb-4">
                                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </div>
                            <h3 className="text-gray-600 font-medium mb-1">Chưa có cuộc trò chuyện nào</h3>
                            <p className="text-gray-400 text-xs mb-4 max-w-[200px]">
                                Kết nối với bạn bè để bắt đầu nhắn tin ngay bây giờ.
                            </p>
                            <button className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition shadow-sm">
                                Tìm bạn bè mới
                            </button>
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
                                                {m.image && (
                                                    <img
                                                        src={getAvatarUrl(m.image)}
                                                        alt="msg-img"
                                                        className="w-full h-auto rounded-lg mb-2 cursor-pointer hover:opacity-90"
                                                        onClick={() => window.open(getAvatarUrl(m.image), '_blank')}
                                                    />
                                                )}

                                                {m.text && <span>{m.text}</span>}

                                                {isMe && (
                                                    <div className="self-end mt-1">
                                                        {m.isRead ? (
                                                            // Đã đọc: dấu tích (Màu xanh nhạt hoặc trắng)
                                                            <FaCheckDouble className="text-xs text-blue-200" title="Đã xem" />
                                                        ) : (
                                                            // Đã gửi: 1 dấu tích
                                                            <FaCheck className="text-xs text-gray-300" title="Đã gửi" />
                                                        )}
                                                    </div>
                                                )}
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

                            {/* HIỂN THỊ ẢNH PREVIEW TRƯỚC KHI GỬI */}
                            {imagePreview && (
                                <div className="absolute bottom-20 left-4 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                                    <div className="relative">
                                        <img src={imagePreview} alt="preview" className="w-24 h-24 object-cover rounded-md" />
                                        <button
                                            onClick={clearImage}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                        >
                                            <FaTimesCircle size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Bảng Emoji */}
                            {showEmoji && (
                                <div className="absolute bottom-20 left-4 z-10">
                                    <EmojiPicker onEmojiClick={onEmojiClick} />
                                </div>
                            )}

                            <form onSubmit={handleSendMessage} className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                                {/* Nút chọn ảnh */}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleImageChange}
                                />
                                <button
                                    type="button"
                                    className="text-gray-500 hover:text-green-600 mr-3"
                                    onClick={() => fileInputRef.current.click()}
                                >
                                    <FaImage size={20} />
                                </button>

                                {/* Nút chọn emoji */}
                                <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="text-gray-500 hover:text-green-600 mr-3"><FaSmile size={20} /></button>

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

            <CreateGroupModal
                isOpen={showCreateGroup}
                onClose={() => setShowCreateGroup(false)}
                users={users} // Truyền danh sách user để chọn
                onCreateSuccess={(newGroup) => setGroups([newGroup, ...groups])}
            />

            {showRequestModal && (
                <FriendRequestModal
                    onClose={() => setShowRequestModal(false)}
                    onAcceptSuccess={fetchFriends} // Reload lại list bạn sau khi đồng ý
                />
            )}
        </div>
    );
};

export default Home;