import { useState, useEffect, useRef, useCallback } from "react";
import { FaUserPlus, FaBell, FaSearch, FaPaperPlane, FaPhone, FaUsers, FaVideo, FaInfoCircle, FaSmile, FaCheck, FaCheckDouble, FaImage, FaTimesCircle } from "react-icons/fa";
import UserProfileSidebar from "../components/UserProfileSidebar";
import axios from "axios";
import UserStatus from "../components/UserStatus";
import { formatTimeAgo } from "../utils/formatTime";
import { toast } from "react-toastify";
import EmojiPicker from 'emoji-picker-react';
import CreateGroupModal from "../components/CreateGroupModal";
import FriendRequestModal from "../components/FriendRequestModal";
import GroupMembersModal from "../components/GroupMembersModal";
import { sendFriendRequest } from "../services/userService";
import { useContext } from 'react';
import { CallContext } from '../context/CallContext';
import { useSocket } from '../context/SocketContext';

const Home = () => {
    // STATE
    const [activeChat, setActiveChat] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // State tin nhắn & chat
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [typingUserName, setTypingUserName] = useState("");
    const [typingUserAvatar, setTypingUserAvatar] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [groups, setGroups] = useState([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showGroupMembers, setShowGroupMembers] = useState(false);
    const [searchResult, setSearchResult] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [requestCount, setRequestCount] = useState(0);
    const [sentRequests, setSentRequests] = useState([]);

    // --- CONTEXT ---
    const { callUser } = useContext(CallContext);
    const { onlineUsers, socket } = useSocket();

    // REF
    const activeChatRef = useRef(null);
    const scrollRef = useRef();
    const fileInputRef = useRef();
    const typingTimeoutRef = useRef(null);

    // BIẾN
    const API_URL = import.meta.env.VITE_API_URL;

    // --- HÀM XỬ LÝ GỌI VIDEO ---
    const handleVideoCall = () => {
        if (!currentChatUser) return;

        const chatUserId = currentChatUser._id || currentChatUser.id;

        if (currentChatUser.members || currentChatUser.isGroup) {
            toast.warning("Chưa hỗ trợ gọi nhóm!");
            return;
        }

        console.log("🔍 Debug - onlineUsers:", onlineUsers);
        console.log("🔍 Debug - chatUserId:", chatUserId);

        // Tìm người dùng trong danh sách online (Lấy từ Context)
        const receiver = onlineUsers.find(user => user.userId === chatUserId);

        console.log("🔍 Debug - receiver:", receiver);

        if (receiver) {
            callUser({
                socketId: receiver.socketId,
                _id: chatUserId,
                displayName: currentChatUser.displayName
            });
        } else {
            toast.info(`Người dùng ${currentChatUser.displayName} đang ngoại tuyến.`);
        }
    };

    // --- CÁC BIẾN TÍNH TOÁN ---
    const currentChatUser = activeChat
        ? (activeChat.members
            ? activeChat
            : (users.find(u => u._id === activeChat._id) || activeChat))
        : null;

    const isFriend = currentChatUser && !currentChatUser.members && (
        currentChatUser.isFriend ||
        users.some(u => u._id === currentChatUser._id)
    );

    // --- USE EFFECTS ---

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            setTimeout(() => {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }, 100);
        }
    }, [messages, activeChat, isTyping]);

    // Update Ref
    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    // Join/Leave group rooms
    useEffect(() => {
        if (!socket) return;

        const isGroup = activeChat?.members ? true : false;

        if (isGroup) {
            socket.emit('joinGroup', activeChat._id);
            console.log(`📍 Client joined group room: ${activeChat._id}`);
        } else if (activeChatRef.current?.members) {
            socket.emit('leaveGroup', activeChatRef.current._id);
            console.log(`📍 Client left group room: ${activeChatRef.current._id}`);
        }
    }, [activeChat, socket]);

    // --- CÁC HÀM HELPER & API ---
    // Hàm load conversation mới nếu chưa có trong list
    const fetchNewConversation = useCallback(async (targetId, isGroup, messageData) => {
        try {
            const token = localStorage.getItem('token');
            const endpoint = isGroup ? `/api/groups/${targetId}` : `/api/users/${targetId}`;
            const res = await axios.get(`${API_URL}${endpoint}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                const newItem = res.data.data || res.data.user || res.data.group;

                // Xử lý nội dung tin nhắn preview
                let previewContent = messageData.text;
                if (!previewContent && messageData.image) previewContent = "[Hình ảnh]";

                // Tạo object user hoàn chỉnh với tin nhắn mới nhất
                const newItemWithMsg = {
                    ...newItem,
                    lastMessage: {
                        content: previewContent,
                        senderId: messageData.senderId,
                        createdAt: messageData.createdAt || new Date().toISOString(),
                        isRead: false
                    },
                    hasUnread: true
                };
                // Thêm vào đầu danh sách
                setUsers(prev => [newItemWithMsg, ...prev]);
            }
        } catch (error) {
            console.error("Không thể load conversation mới:", error);
        }
    }, [API_URL]);

    const renderLastMessage = (user, currentUserId) => {
        if (!user.lastMessage) return <span className="text-gray-400 italic">Bắt đầu trò chuyện</span>;
        const { content, senderId } = user.lastMessage;
        const isMe = senderId === currentUserId;
        const prefix = isMe ? "Bạn: " : "";
        return (
            <span className={user.hasUnread ? "text-gray-900 font-semibold" : "text-gray-500"}>
                {prefix}{content}
            </span>
        );
    };

    const handleAddFriend = async (e, user) => {
        e.stopPropagation();
        try {
            await sendFriendRequest(user._id);
            setSentRequests((prev) => [...prev, user._id]);
            toast.success("Đã gửi lời mời kết bạn");
        } catch (error) {
            console.error(error);
            toast.error("Lỗi gửi lời mời kết bạn");
        }
    };

    const getAvatarUrl = (avatarPath) => {
        if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
        if (avatarPath.startsWith('http')) return avatarPath;
        return `${API_URL}${avatarPath}`;
    };

    const checkIsOnline = (user) => {
        if (!user || !onlineUsers || onlineUsers.length === 0) return false;

        const isOnline = onlineUsers.some(u => u.userId === user._id);
        return isOnline;
    };

    // --- FETCH DATA INITIAL ---
    const fetchData = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login';
                return;
            }
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const [profileRes, sidebarRes, requestRes] = await Promise.all([
                axios.get(`${API_URL}/api/users/profile`, config),
                axios.get(`${API_URL}/api/users/sidebar-list`, config),
                axios.get(`${API_URL}/api/users/friend-requests`, config)
            ]);

            if (profileRes.data.success) setCurrentUser(profileRes.data.user);
            if (sidebarRes.data.success) {
                const fetchedList = sidebarRes.data.users || sidebarRes.data.friends || [];
                setUsers(fetchedList);
            }
            if (requestRes.data.success) setRequestCount(requestRes.data.requests.length);

        } catch (error) {
            console.error("Lỗi tải dữ liệu:", error);
            if (error.response?.status === 401) {
                localStorage.removeItem("token");
                window.location.href = '/login';
            }
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    useEffect(() => {
        // Emit addNewUser khi Home component mount (fallback)
        if (socket && currentUser) {
            console.log(`📤 Home mounted: Emitting addNewUser với userId: ${currentUser._id}`);
            socket.emit("addNewUser", currentUser._id);
        }
    }, [socket, currentUser]);

    useEffect(() => {
        fetchData();
        // Fetch groups riêng
        const fetchGroups = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;
                const res = await axios.get(`${API_URL}/api/groups`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.data.success) setGroups(res.data.groups);
            } catch (error) { console.error(error); }
        };
        fetchGroups();
    }, [API_URL, fetchData]);


    // --- SEARCH LOGIC ---
    useEffect(() => {
        if (!searchTerm.trim()) {
            setSearchResult([]);
            return;
        }
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const token = localStorage.getItem('token');
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const res = await axios.get(`${API_URL}/api/users/search?keyword=${searchTerm}`, config);
                if (res.data.success) setSearchResult(res.data.users);
            } catch (error) {
                console.error("Lỗi tìm kiếm:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, API_URL]);

    const usersToDisplay = searchTerm.trim() ? searchResult : users;

    // --- SOCKET CONNECTION ---
    useEffect(() => {
        // Nếu chưa có socket hoặc currentUser chưa load xong thì không làm gì
        if (!socket || !currentUser) return;

        // -- LOGIC CẬP NHẬT TRẠNG THÁI ONLINE --
        // (Lưu ý: Context đã tự handle 'getOnlineUsers' để cập nhật onlineUsers)

        // có người vừa offline
        socket.on("userDisconnected", (userId) => {
            setUsers(prevUsers => prevUsers.map(user => {
                if (user._id === userId) {
                    return {
                        ...user,
                        activityStatus: {
                            ...(user.activityStatus || {}),
                            lastSeen: new Date().toISOString(),
                        }
                    }
                }
                return user;
            }));
        });

        // Lắng nghe sự kiện gửi kết bạn
        socket.on("newFriendRequest", (data) => {
            setRequestCount((prev) => prev + 1);
            toast.info(`${data.senderName} đã gửi lời mời kết bạn`, {
                position: "top-right",
                autoClose: 5000,
            })
            setUsers(prev => prev.map(user => {
                if (user._id === data.senderId) {
                    return { ...user, isIncomingRequest: true }
                }
                return user;
            }))
        });

        // Lắng nghe chấp nhận kết bạn
        socket.on("friendRequestAccepted", (data) => {
            setUsers(prev => {
                const updatedUsers = prev.map(user => {
                    if (user._id === data.newFriendId) {
                        return {
                            ...user,
                            isFriend: true,
                            isIncomingRequest: false
                        };
                    }
                    return user;
                });

                const userExists = updatedUsers.some(u => u._id === data.newFriendId);
                if (!userExists) {
                    updatedUsers.push({
                        _id: data.newFriendId,
                        displayName: data.newFriendName,
                        avatar: data.newFriendAvatar,
                        isFriend: true,
                        lastMessage: null,
                        hasUnread: false
                    });
                }
                return updatedUsers;
            });

            toast.success(`${data.newFriendName} đã chấp nhận lời mời kết bạn`, {
                position: "top-right",
                autoClose: 3000,
            });
        });

        // CLEANUP
        return () => {
            socket.off("userConnected");
            socket.off("userDisconnected");
            socket.off("newFriendRequest");
            socket.off("friendRequestAccepted");
        };
    }, [socket, currentUser, API_URL]);

    // ✅ SỬA: READ RECEIPTS LISTENER
    useEffect(() => {
        if (!socket) return;

        const handleUserRead = (data) => {
            const { readerId } = data;
            setUsers(prev => prev.map(u => {
                if (u._id === readerId) {
                    const lm = u.lastMessage ? { ...u.lastMessage, isRead: true } : u.lastMessage;
                    return { ...u, hasUnread: false, lastMessage: lm };
                }
                return u;
            }));

            if (activeChat && !activeChat.members && activeChat._id === readerId) {
                setMessages(prev => prev.map(m => {
                    const senderId = typeof m.sender === 'object' ? m.sender?._id : m.sender;
                    if (senderId === currentUser._id) {
                        return { ...m, isRead: true };
                    }
                    return m;
                }));
            }
        };

        const handleGroupUserRead = (data) => {
            const { groupId, readerId } = data;
            if (activeChat && activeChat.members && activeChat._id === groupId) {
                setMessages(prev => prev.map(m => {
                    const readBy = m.readBy ? Array.from(new Set(m.readBy)) : [];
                    if (!readBy.includes(readerId)) {
                        return { ...m, readBy: [...readBy, readerId] };
                    }
                    return m;
                }));
            }
            setGroups(prev => prev.map(g => {
                if (g._id === groupId) {
                    if (g.lastMessage) {
                        const readBy = g.lastMessage.readBy ? Array.from(new Set(g.lastMessage.readBy)) : [];
                        if (!readBy.includes(readerId)) {
                            return { ...g, lastMessage: { ...g.lastMessage, readBy: [...readBy, readerId] } };
                        }
                    }
                }
                return g;
            }));
        };

        socket.on('userReadMessages', handleUserRead);
        socket.on('groupUserRead', handleGroupUserRead);

        return () => {
            socket.off('userReadMessages', handleUserRead);
            socket.off('groupUserRead', handleGroupUserRead);
        };
    }, [socket, activeChat, currentUser]);


    // ✅ SỬA: MESSAGE LISTENER
    useEffect(() => {
        if (!socket) return;

        const handleUnifiedMessage = (data) => {
            console.log("Socket nhận tin nhắn:", data);
            const currentActiveChat = activeChatRef.current;

            // CẬP NHẬT SIDEBAR
            setUsers((prevUsers) => {
                const updatedUsers = [...prevUsers];
                const targetId = data.isGroup ? data.receiverId : data.senderId;
                const index = updatedUsers.findIndex((u) => u._id === targetId);

                if (index !== -1) {
                    const userToUpdate = updatedUsers[index];
                    let previewContent = data.text;
                    if (!previewContent && data.image) previewContent = "[Hình ảnh]";

                    const updatedUser = {
                        ...userToUpdate,
                        lastMessage: {
                            content: previewContent,
                            senderId: data.senderId,
                            createdAt: data.createdAt || new Date().toISOString(),
                            isRead: false
                        },
                        hasUnread: currentActiveChat?._id !== targetId
                    };

                    updatedUsers.splice(index, 1);
                    updatedUsers.unshift(updatedUser);
                    return updatedUsers;
                } else {
                    fetchNewConversation(targetId, data.isGroup, data);
                    return prevUsers;
                }
            });

            // CẬP NHẬT MESSAGES
            const isViewingChat = (data.isGroup && currentActiveChat?._id === data.receiverId) ||
                (!data.isGroup && (currentActiveChat?._id === data.senderId || currentActiveChat?._id === data.receiverId));

            if (isViewingChat) {
                const isMeSender = data.senderId === currentUser._id;
                const computedIsRead = data.isGroup ? true : (!isMeSender);

                setMessages((prev) => [...prev, {
                    sender: data.sender || {
                        _id: data.senderId,
                        displayName: 'Người dùng',
                        avatar: null
                    },
                    text: data.text,
                    image: data.image,
                    type: data.type,
                    createdAt: data.createdAt,
                    isRead: computedIsRead
                }]);

                if (data.senderId !== currentUser._id) {
                    if (data.isGroup) {
                        socket.emit("markRead", {
                            isGroup: true,
                            groupId: data.receiverId,
                            readerId: currentUser._id
                        });
                    } else {
                        socket.emit("markRead", {
                            senderId: data.senderId,
                            receiverId: currentUser._id
                        });
                    }
                }
                setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            } else {
                if (data.type !== 'system') {
                    const sender = users.find(u => u._id === data.senderId);
                    const senderName = sender ? sender.displayName : "Ai đó";
                    toast.info(`Tin nhắn mới từ ${senderName}`, {
                        position: "top-right",
                        autoClose: 3000,
                        hideProgressBar: true
                    });
                }
            }
        };

        socket.on("getMessage", handleUnifiedMessage);

        return () => {
            socket.off("getMessage", handleUnifiedMessage);
        };
    }, [socket, currentUser, users, fetchNewConversation]);

    // FETCH MESSAGE KHI CHỌN USER
    useEffect(() => {
        const fetchMessages = async () => {
            if (!activeChat || !currentUser) return;
            setMessages([]);
            try {
                const isGroup = activeChat.members ? true : false;
                const url = isGroup
                    ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true`
                    : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}`;

                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                setMessages(res.data);
                // Khi mở cuộc chat, đánh dấu đã đọc (1-1 hoặc group)
                if (socket) {
                    if (isGroup) {
                        socket.emit('markRead', { isGroup: true, groupId: activeChat._id, readerId: currentUser._id });
                    } else {
                        socket.emit('markRead', { senderId: activeChat._id, receiverId: currentUser._id });
                    }
                }
            } catch (err) {
                console.error("Lỗi fetch tin nhắn:", err);
            }
        };
        fetchMessages();
    }, [activeChat, currentUser, API_URL, socket]);

    // ✅ SỬA: TYPING LOGIC (Dùng socket từ Context)
    useEffect(() => {
        if (!socket) return;

        const handleTyping = (data) => {
            if (!activeChatRef.current) return;
            const { chatId, isGroup, senderId, senderName, senderAvatar } = data;
            if (senderId === currentUser?._id) return;

            if (activeChatRef.current._id === chatId) {
                setIsTyping(true);
                if (isGroup && senderName) {
                    setTypingUserName(senderName);
                    setTypingUserAvatar(senderAvatar);
                }
            }
        };

        const handleStopTyping = (data) => {
            if (!activeChatRef.current) return;
            const { chatId, senderId } = data;
            if (senderId === currentUser?._id) return;

            if (activeChatRef.current._id === chatId) {
                setIsTyping(false);
                setTypingUserName("");
                setTypingUserAvatar(null);
            }
        };

        socket.on("getTyping", handleTyping);
        socket.on("getStopTyping", handleStopTyping);

        return () => {
            socket.off("getTyping", handleTyping);
            socket.off("getStopTyping", handleStopTyping);
        };
    }, [socket, currentUser]);

    useEffect(() => {
        setIsTyping(false);
        setTypingUserName("");
        setTypingUserAvatar(null);
    }, [activeChat]);

    // --- HANDLERS ---
    const handleScrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    };
    const handleSelectUser = (user) => {
        // Set người dùng đang chat để mở đoạn chat
        setActiveChat(user);

        // Đánh dấu tin nhắn là đã đọc (sidebar)
        setUsers(prev => prev.map((u) => {
            if (u._id === user._id) {
                const lm = u.lastMessage ? { ...u.lastMessage, isRead: true } : u.lastMessage;
                return {
                    ...u,
                    hasUnread: false,
                    lastMessage: lm
                }
            }
            return u;
        }))

        if (socket) {
            socket.emit("markRead", {
                senderId: user._id,
                receiverId: currentUser._id
            });
        }
    };

    // Socket listener cho cập nhật nhóm
    useEffect(() => {
        if (!socket) return;

        const handleGroupAdminChanged = (data) => {
            const { groupId, newAdminId } = data;
            setGroups(prevGroups =>
                prevGroups.map(g => g._id === groupId ? { ...g, admin: newAdminId } : g)
            );
            if (activeChat?._id === groupId) {
                setActiveChat(prev => ({ ...prev, admin: newAdminId }));
            }
        };

        const handleGroupRenamed = (data) => {
            const { groupId, newName, newAvatar } = data;
            setGroups(prevGroups =>
                prevGroups.map(g => g._id === groupId ? { ...g, name: newName, avatar: newAvatar } : g)
            );
            if (activeChat?._id === groupId) {
                setActiveChat(prev => ({ ...prev, name: newName, avatar: newAvatar }));
            }
        };

        const handleGroupMemberUpdated = (data) => {
            const { groupId, updatedGroup, removedMemberId, isVoluntaryLeave } = data;

            if (removedMemberId === currentUser._id) {
                try {
                    socket.emit('leaveGroup', groupId);
                } catch (err) { console.error(err); }

                if (activeChat?._id === groupId) {
                    setShowGroupMembers(false);
                    setActiveChat(null);
                }
                const message = isVoluntaryLeave ? "Bạn đã rời khỏi nhóm" : "Bạn đã bị xóa khỏi nhóm";
                toast.info(message);
                setGroups(prevGroups => prevGroups.filter(g => g._id !== groupId));
                return;
            }

            if (updatedGroup) {
                setGroups(prevGroups =>
                    prevGroups.map(g => g._id === groupId ? { ...g, members: updatedGroup.members } : g)
                );
            }
            if (activeChat?._id === groupId && updatedGroup) {
                setActiveChat(prev => ({ ...prev, members: updatedGroup.members }));
            }
        };

        const handleGroupDeleted = (data) => {
            const { groupId } = data;
            if (activeChat?._id === groupId) {
                setShowGroupMembers(false);
                setActiveChat(null);
            }
            setGroups(prevGroups => prevGroups.filter(g => g._id !== groupId));
            try {
                socket.emit('leaveGroup', groupId);
            } catch (err) { console.error(err); }
        };

        socket.on("groupAdminChanged", handleGroupAdminChanged);
        socket.on("groupRenamed", handleGroupRenamed);
        socket.on("groupMemberUpdated", handleGroupMemberUpdated);
        socket.on("groupDeleted", handleGroupDeleted);

        return () => {
            socket.off("groupAdminChanged", handleGroupAdminChanged);
            socket.off("groupRenamed", handleGroupRenamed);
            socket.off("groupMemberUpdated", handleGroupMemberUpdated);
            socket.off("groupDeleted", handleGroupDeleted);
        };
    }, [socket, activeChat, currentUser]);

    const handleInputChange = (e) => {
        setNewMessage(e.target.value);
        if (!socket || !activeChat) return;

        const isGroup = activeChat.members ? true : false;

        socket.emit("typing", {
            receiverId: activeChat._id,
            isGroup: isGroup,
            senderId: currentUser._id,
            senderName: currentUser.displayName,
            senderAvatar: currentUser.avatar
        });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            console.log("📤 Emitting stopTyping:", {
                receiverId: activeChat._id,
                isGroup: isGroup,
                senderId: currentUser._id
            });
            socket.emit("stopTyping", {
                receiverId: activeChat._id,
                isGroup: isGroup,
                senderId: currentUser._id
            });
        }, 2000);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() && !imageFile) return;

        // Kiểm tra xem user còn trong group hay không (nếu là group)
        if (activeChat?.members) {
            const isStillMember = activeChat.members.some(m => m._id === currentUser._id);
            if (!isStillMember) {
                toast.error("Bạn đã bị xóa khỏi nhóm này");
                setActiveChat(null);
                return;
            }
        }

        let imageUrl = "";
        try {
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
            const messagePayload = {
                sender: currentUser._id,
                receiver: activeChat._id,
                text: newMessage,
                image: imageUrl,
                isGroup: isGroup
            };

            // 1. Lưu DB
            const res = await axios.post(`${API_URL}/api/messages`, messagePayload, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            const savedMessage = res.data;

            // 2. Gửi Socket
            socket.emit("sendMessage", {
                ...messagePayload,
                createdAt: savedMessage.createdAt,
                senderId: currentUser._id,
                receiverId: activeChat._id,
                text: savedMessage.text,
                image: savedMessage.image,
            });

            // 3. Update UI Sidebar (Đưa lên đầu)
            setUsers((prevUsers) => {
                const updatedUsers = [...prevUsers];
                const index = updatedUsers.findIndex((u) => u._id === activeChat._id);

                if (index !== -1) {
                    const userToUpdate = updatedUsers[index];
                    let previewContent = savedMessage.text;
                    if (!previewContent && savedMessage.image) previewContent = "[Hình ảnh]";

                    const updatedUser = {
                        ...userToUpdate,
                        lastMessage: {
                            content: previewContent,
                            senderId: currentUser._id,
                            createdAt: savedMessage.createdAt || new Date().toISOString(),
                            isRead: false
                        },
                        hasUnread: false
                    };
                    updatedUsers.splice(index, 1);
                    updatedUsers.unshift(updatedUser);
                }
                return updatedUsers;
            });

            setNewMessage("");
            clearImage();
            setShowEmoji(false);

        } catch (err) {
            console.error(err);
            toast.error("Lỗi gửi tin nhắn");
        }
    };

    const onEmojiClick = (emojiObject) => {
        setNewMessage((prev) => prev + emojiObject.emoji);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const clearImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        window.location.reload();
    };

    const handleUpdateSuccess = (updatedUser) => {
        setCurrentUser(updatedUser);
    };



    if (isLoading) return <div className="h-screen flex items-center justify-center">Loading...</div>;

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">
            {/* --- SIDEBAR --- */}
            <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-blue-600 text-white relative z-10 shadow-md">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => setShowProfile(true)} className="focus:outline-none group relative" title="Xem hồ sơ">
                            <img src={getAvatarUrl(currentUser?.avatar)} alt="User Avatar" className="w-10 h-10 rounded-full object-cover border-2 border-blue-400 group-hover:border-white transition-all" />
                            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white bg-green-400"></span>
                        </button>
                        <h1 className="text-xl font-bold hidden md:block">Chat App</h1>
                    </div>
                    <div className="flex items-center">
                        <button onClick={() => setShowCreateGroup(true)} className="ml-2 text-white hover:text-blue-200"><FaUsers size={20} /></button>
                        <button
                            onClick={() => setShowRequestModal(true)}
                            className="relative ml-4 focus:outline-none group transition-transform active:scale-95"
                            title="Thông báo kết bạn"
                        >
                            <FaBell
                                size={20}
                                className={`transition-all duration-300 ${requestCount > 0 ? 'text-yellow-300 animate-pulse' : 'hover:text-blue-200'}`}
                            />

                            {requestCount > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>

                                    <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 border-2 border-blue-600 text-white text-[10px] font-bold items-center justify-center">
                                        {requestCount > 9 ? '9+' : requestCount}
                                    </span>
                                </span>
                            )}
                        </button>
                        <button onClick={handleLogout} className="ml-4 text-xs bg-blue-800 px-3 py-2 rounded hover:bg-blue-900 font-semibold">Logout</button>
                    </div>
                </div>

                <div className="p-4">
                    <div className="relative">
                        <FaSearch className="absolute top-3 left-3 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {isSearching && <div className="absolute top-3 right-3 animate-spin rounded-full h-4 w-4 border-b-2 border-green-500"></div>}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Groups */}
                    {groups.length > 0 && (
                        <>
                            <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Nhóm chat</div>
                            {groups.map(group => (
                                <div key={group._id} onClick={() => handleSelectUser(group)} className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-50">
                                    <img src={getAvatarUrl(group.avatar)} className="w-10 h-10 rounded-full object-cover" />
                                    <div className="ml-3">
                                        <h3 className="font-semibold text-sm">{group.name}</h3>
                                        <p className="text-xs text-gray-400">{group.members.length} thành viên</p>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    {/* Users */}
                    <div className="px-4 py-2 bg-gray-50 text-xs font-bold text-gray-500 uppercase">Tin nhắn</div>
                    {usersToDisplay.length > 0 ? (
                        usersToDisplay.map((user) => {
                            const isMe = user._id === currentUser?._id;
                            if (isMe) return null;

                            const isFriend = user.isFriend || (users.some(u => u._id === user._id));
                            const isSent = user.isSent || sentRequests.includes(user._id);
                            const hasUnread = isFriend && user.hasUnread;

                            return (
                                <div key={user._id} onClick={() => handleSelectUser(user)}
                                    className={`group p-4 flex items-center border-b border-gray-50 transition cursor-pointer ${hasUnread ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}>

                                    <div className="relative flex-shrink-0">
                                        <img src={getAvatarUrl(user.avatar)} alt="Avt" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                                        {isFriend && checkIsOnline(user) && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white"></div>}
                                    </div>

                                    <div className="ml-3 flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className={`text-sm truncate pr-2 ${hasUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{user.displayName}</h3>
                                            {user.lastMessage && (
                                                <span className={`text-[10px] flex-shrink-0 ${hasUnread ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                                                    {new Date(user.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center h-5">
                                            <p className="text-xs truncate text-gray-500 w-full">
                                                {searchTerm && !isFriend && !user.lastMessage ? <span className="text-blue-500">Người lạ • Kết bạn</span> : renderLastMessage(user, currentUser._id)}
                                            </p>
                                        </div>
                                    </div>

                                    {!isFriend && (
                                        <div className="ml-2 flex-shrink-0">
                                            {isSent ? (
                                                <button disabled className="flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-500 rounded-full cursor-not-allowed"><FaCheck size={12} /></button>
                                            ) : (
                                                <button onClick={(e) => handleAddFriend(e, user)} className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition shadow-sm"><FaUserPlus size={14} /></button>
                                            )}
                                        </div>
                                    )}
                                    {isFriend && hasUnread && <div className="ml-2 flex-shrink-0"><span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">N</span></div>}
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center mt-10 text-gray-400"><p className="text-sm">Không tìm thấy người dùng.</p></div>
                    )}
                </div>
            </div>

            {/* --- CHAT WINDOW --- */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {activeChat && currentChatUser ? (
                    <>

                        {/* CHAT HEADER */}
                        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
                            <div className="flex items-center">
                                <img src={getAvatarUrl(currentChatUser.avatar)} className="w-11 h-11 rounded-full mr-3 object-cover border border-gray-200" alt="avatar" />
                                <div>
                                    <h3 className="font-bold text-gray-800">{currentChatUser.displayName || currentChatUser.name}</h3>
                                    {!currentChatUser.members && (
                                        isFriend ? (
                                            <UserStatus
                                                user={currentChatUser}
                                                isOnline={checkIsOnline(currentChatUser)}
                                            />
                                        ) : (
                                            <></>
                                        )
                                    )}

                                    {currentChatUser.members && (
                                        <span className="text-xs text-gray-500">
                                            {currentChatUser.members.length} thành viên
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex space-x-4 text-blue-600">
                                {/* Nút Gọi Thoại */}
                                <button
                                    className="hover:bg-gray-100 p-2 rounded-full transition-colors"
                                    onClick={() => alert("Tính năng gọi thoại đang phát triển")}
                                >
                                    <FaPhone />
                                </button>

                                <button
                                    onClick={handleVideoCall}
                                    className="hover:bg-blue-100 p-2 rounded-full transition-colors text-blue-600"
                                    title="Gọi Video"
                                    disabled={currentChatUser.members}
                                >
                                    <FaVideo />
                                </button>

                                {activeChat?.members && (
                                    <button
                                        onClick={() => setShowGroupMembers(true)}
                                        className="hover:bg-gray-100 p-2 rounded-full transition-colors"
                                        title="Quản lý thành viên"
                                    >
                                        <FaInfoCircle />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={scrollRef} onClick={handleScrollToBottom}>
                            {messages.map((m, index) => {
                                const senderId = typeof m.sender === 'object' ? m.sender?._id : m.sender;
                                const isMe = senderId === currentUser._id;
                                const isGroup = activeChat.members ? true : false;
                                const senderInfo = typeof m.sender === 'object' ? m.sender : null;
                                const senderName = senderInfo?.displayName || senderInfo?.email?.split('@')[0] || 'Người dùng';
                                const senderAvatar = senderInfo?.avatar || activeChat.avatar;
                                const isSystemMessage = m.type === 'system';

                                if (isSystemMessage) {
                                    return (
                                        <div key={index} className="flex justify-center my-4">
                                            <div className="bg-gray-200 text-gray-600 text-xs px-4 py-1 rounded-full flex items-center shadow-sm">
                                                {m.text}
                                            </div>
                                        </div>
                                    );
                                }

                                // Regular message rendering
                                return (
                                    <div key={index}>
                                        {/* Nhóm: Hiển thị tên người gửi nếu không phải tin nhắn của mình */}
                                        {isGroup && !isMe && senderInfo && (
                                            <div className="flex items-center ml-2 mb-1">
                                                <span className="text-xs font-semibold text-gray-600">{senderName}</span>
                                            </div>
                                        )}

                                        <div className={`flex ${isMe ? 'justify-end' : ''}`}>
                                            {/* Chat 1-1: Chỉ hiển thị avatar cho tin nhắn người khác */}
                                            {!isMe && !isGroup && (
                                                <img src={getAvatarUrl(activeChat.avatar)} className="w-8 h-8 rounded-full mr-2 mt-1 object-cover" alt="avt" />
                                            )}

                                            {/* Nhóm: Hiển thị avatar nhỏ cho tin nhắn người khác */}
                                            {!isMe && isGroup && (
                                                <img src={getAvatarUrl(senderAvatar)} className="w-8 h-8 rounded-full mr-2 mt-1 object-cover" alt="avt" />
                                            )}

                                            <div className={`p-3 max-w-xs shadow-sm text-sm ${isMe ? 'bg-green-600 text-white rounded-l-2xl rounded-br-2xl' : 'bg-white text-gray-800 border border-gray-100 rounded-r-2xl rounded-bl-2xl'}`}>
                                                {m.image && <img src={getAvatarUrl(m.image)} className="w-full h-auto rounded-lg mb-2 cursor-pointer hover:opacity-90" onClick={() => window.open(getAvatarUrl(m.image), '_blank')} />}
                                                {m.text && <span>{m.text}</span>}
                                                {isMe && (
                                                    <div className="self-end mt-1 text-right">
                                                        {/* 1-1: use isRead flag. Group: consider readBy array length */}
                                                        {(!isGroup) ? (
                                                            m.isRead ? <FaCheckDouble className="text-xs text-blue-200 inline-block" /> : <FaCheck className="text-xs text-gray-300 inline-block" />
                                                        ) : (
                                                            (m.readBy && m.readBy.length > 0) ? <FaCheckDouble className="text-xs text-blue-200 inline-block" /> : <FaCheck className="text-xs text-gray-300 inline-block" />
                                                        )}
                                                    </div>
                                                )}

                                                {/* For group messages sent by me, show the list of reader names when available */}
                                                {isMe && isGroup && m.readBy && m.readBy.length > 0 && (
                                                    (() => {
                                                        const readerIds = m.readBy.map(r => (typeof r === 'object' ? r._id : r));
                                                        const readerNames = readerIds.map(id => {
                                                            const member = activeChat?.members?.find(mm => mm._id === id) || users.find(u => u._id === id);
                                                            return member?.displayName || member?.name || 'Người dùng';
                                                        });
                                                        return (
                                                            <div className="text-[11px] mt-1 text-gray-200/90">
                                                                <span className="text-white/70">Đã xem:</span> <span className="font-medium">{readerNames.join(', ')}</span>
                                                            </div>
                                                        );
                                                    })()
                                                )}
                                            </div>
                                        </div>
                                        <div className={`text-[10px] text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left ml-10'}`}>{formatTimeAgo(m.createdAt)}</div>
                                    </div>
                                );
                            })}

                            {isTyping && (
                                <div className="flex items-center ml-2 mt-2">
                                    <img src={getAvatarUrl(activeChat.members ? typingUserAvatar : activeChat.avatar)} className="w-6 h-6 rounded-full mr-2 object-cover" />
                                    <div>
                                        {typingUserName && activeChat.members && (
                                            <div className="text-xs text-gray-500 ml-1 mb-1">{typingUserName} đang gõ...</div>
                                        )}
                                        <div className="bg-gray-200 p-3 rounded-2xl rounded-tl-none flex items-center space-x-1 w-16 h-9">
                                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-4 border-t border-gray-200">
                            {imagePreview && (
                                <div className="absolute bottom-20 left-4 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
                                    <div className="relative">
                                        <img src={imagePreview} alt="preview" className="w-24 h-24 object-cover rounded-md" />
                                        <button onClick={clearImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"><FaTimesCircle size={12} /></button>
                                    </div>
                                </div>
                            )}
                            {showEmoji && <div className="absolute bottom-20 left-4 z-10"><EmojiPicker onEmojiClick={onEmojiClick} /></div>}
                            <form onSubmit={handleSendMessage} className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageChange} />
                                <button type="button" className="text-gray-500 hover:text-green-600 mr-3" onClick={() => fileInputRef.current.click()}><FaImage size={20} /></button>
                                <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="text-gray-500 hover:text-green-600 mr-3"><FaSmile size={20} /></button>
                                <input type="text" placeholder="Nhập tin nhắn..." className="flex-1 bg-transparent focus:outline-none" value={newMessage} onChange={handleInputChange} />
                                <button type="submit" className="text-green-600 hover:text-green-800 ml-3"><FaPaperPlane size={20} /></button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4"><FaPaperPlane size={40} className="text-gray-400 ml-2" /></div>
                        <p className="text-lg">Chọn một cuộc trò chuyện để bắt đầu</p>
                    </div>
                )}
            </div>

            {showProfile && <UserProfileSidebar isOpen={showProfile} user={{ ...currentUser, avatar: getAvatarUrl(currentUser?.avatar) }} onClose={() => setShowProfile(false)} onUpdateSuccess={handleUpdateSuccess} />}
            <CreateGroupModal isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} users={users} onCreateSuccess={(newGroup) => setGroups([newGroup, ...groups])} />
            {showRequestModal && <FriendRequestModal onClose={() => setShowRequestModal(false)} onSuccess={fetchData} setRequestCount={setRequestCount} />}
            {showGroupMembers && activeChat?.members && currentUser && (
                <GroupMembersModal
                    group={activeChat}
                    currentUser={currentUser}
                    onClose={() => setShowGroupMembers(false)}
                    onGroupUpdated={(updatedGroup) => {
                        // Cập nhật activeChat
                        setActiveChat(updatedGroup);
                        // Cập nhật lại danh sách groups
                        setGroups(groups.map(g => g._id === updatedGroup._id ? updatedGroup : g));
                        // Nếu user rời nhóm thì đóng modal và reset activeChat
                        if (!updatedGroup.members.some(m => m._id === currentUser._id)) {
                            setShowGroupMembers(false);
                            setActiveChat(null);
                            // Do server will emit groupMemberUpdated which triggers the leave notification,
                            // avoid showing a duplicate toast here.
                        }
                    }}
                />
            )}
        </div>
    );
}

export default Home;