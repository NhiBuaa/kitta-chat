import { useState, useEffect, useRef, useCallback, useContext } from "react";
import axios from "axios";
import { toast } from "react-toastify";

// COMPONENTS
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import UserProfileSidebar from "../components/UserProfileSidebar";
import CreateGroupModal from "../components/CreateGroupModal";
import FriendRequestModal from "../components/FriendRequestModal";
import GroupMembersModal from "../components/GroupMembersModal";
import ChatInput from "../components/ChatInput";
import { FilePicker } from "../components/FilePicker"

// CONTEXT & SERVICE
import { CallContext } from "../context/CallContext";
import { useSocket } from "../context/SocketContext";
import { sendFriendRequest } from "../services/userService";

// HOOK
import { useUploader } from '../hooks/useUploader'

const Home = () => {
  // STATE
  const [activeChat, setActiveChat] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // STATE TIN NHẮN & CHAT
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUserName, setTypingUserName] = useState("");
  const [typingUserAvatar, setTypingUserAvatar] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [groups, setGroups] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [searchResult, setSearchResult] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [sentRequests, setSentRequests] = useState([]);

  // CONTEXT
  const { callUser } = useContext(CallContext);
  const { onlineUsers, socket } = useSocket();

  // REF
  const activeChatRef = useRef(null);
  const scrollRef = useRef();
  const typingTimeoutRef = useRef(null);

  // BIẾN
  const API_URL = import.meta.env.VITE_API_URL;

  // HOOK
  const { uploadQueue, addFiles, clearUploads, removeUploadItem } = useUploader();

  // HÀM XỬ LÝ GỌI VIDEO
  const handleVideoCall = () => {
    if (!currentChatUser) return;
    const chatUserId = currentChatUser._id || currentChatUser.id;
    if (currentChatUser.members || currentChatUser.isGroup) {
      toast.warning("Chưa hỗ trợ gọi nhóm!");
      return;
    }
    const receiver = onlineUsers.find((user) => user.userId === chatUserId);
    if (receiver) {
      callUser({
        socketId: receiver.socketId,
        _id: chatUserId,
        displayName: currentChatUser.displayName,
      });
    } else {
      toast.info(`Người dùng ${currentChatUser.displayName} đang ngoại tuyến.`);
    }
  };

  // CÁC BIẾN TÍNH TOÁN
  const currentChatUser = activeChat
    ? activeChat.members
      ? activeChat
      : users.find((u) => u._id === activeChat._id) || activeChat
    : null;

  const isFriend =
    currentChatUser &&
    !currentChatUser.members &&
    (currentChatUser.isFriend ||
      users.some((u) => u._id === currentChatUser._id));

  // USE EFFECTS
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (socket && userStr) {
      const user = JSON.parse(userStr);
      if (user && user._id) {
        socket.emit("addNewUser", user._id);
      }
    }
  }, [socket]);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [messages, activeChat, isTyping]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!socket) return;
    const isGroup = activeChat?.members ? true : false;
    if (isGroup) {
      socket.emit("joinGroup", activeChat._id);
    } else if (activeChatRef.current?.members) {
      socket.emit("leaveGroup", activeChatRef.current._id);
    }
  }, [activeChat, socket]);

  // CÁC HÀM HELPER & API
  const fetchNewConversation = useCallback(
    async (targetId, isGroup, messageData) => {
      try {
        const token = localStorage.getItem("token");
        const endpoint = isGroup
          ? `/api/groups/${targetId}`
          : `/api/users/${targetId}`;
        const res = await axios.get(`${API_URL}${endpoint}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data.success) {
          const newItem = res.data.data || res.data.user || res.data.group;
          let previewContent = messageData.text;
          if (!previewContent && messageData.image)
            previewContent = "[Hình ảnh]";

          const newItemWithMsg = {
            ...newItem,
            lastMessage: {
              content: previewContent,
              senderId: messageData.senderId,
              createdAt: messageData.createdAt || new Date().toISOString(),
              isRead: false,
            },
            hasUnread: true,
          };
          setUsers((prev) => [newItemWithMsg, ...prev]);
        }
      } catch (error) {
        console.error("Không thể load conversation mới:", error);
      }
    },
    [API_URL]
  );

  const renderLastMessage = (user, currentUserId) => {
    if (!user.lastMessage)
      return <span className="text-gray-400 italic">Bắt đầu trò chuyện</span>;
    const { content, senderId } = user.lastMessage;
    const isMe = senderId === currentUserId;
    const prefix = isMe ? "Bạn: " : "";
    return (
      <span
        className={
          user.hasUnread ? "text-gray-900 font-semibold" : "text-gray-500"
        }
      >
        {prefix}
        {content}
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
    if (avatarPath.startsWith("http")) return avatarPath;
    return `${API_URL}${avatarPath}`;
  };

  const checkIsOnline = (user) => {
    if (!user || !onlineUsers || onlineUsers.length === 0) return false;
    return onlineUsers.some((u) => u.userId === user._id);
  };

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [profileRes, sidebarRes, requestRes] = await Promise.all([
        axios.get(`${API_URL}/api/users/profile`, config),
        axios.get(`${API_URL}/api/users/sidebar-list`, config),
        axios.get(`${API_URL}/api/users/friend-requests`, config),
      ]);

      if (profileRes.data.success) setCurrentUser(profileRes.data.user);
      if (sidebarRes.data.success) {
        const fetchedList =
          sidebarRes.data.users || sidebarRes.data.friends || [];
        setUsers(fetchedList);
      }
      if (requestRes.data.success)
        setRequestCount(requestRes.data.requests.length);
    } catch (error) {
      console.error("Lỗi tải dữ liệu:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    if (socket && currentUser) {
      socket.emit("addNewUser", currentUser._id);
    }
  }, [socket, currentUser]);

  useEffect(() => {
    fetchData();
    const fetchGroups = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success) setGroups(res.data.groups);
      } catch (error) {
        console.error(error);
      }
    };
    fetchGroups();
  }, [API_URL, fetchData]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResult([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const token = localStorage.getItem("token");
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const res = await axios.get(
          `${API_URL}/api/users/search?keyword=${searchTerm}`,
          config
        );
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

  // SOCKET CONNECTION
  useEffect(() => {
    if (!socket || !currentUser) return;

    const handleUserDisconnected = (userId) => {
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          if (user._id === userId) {
            return {
              ...user,
              activityStatus: {
                ...(user.activityStatus || {}),
                lastSeen: new Date().toISOString(),
              },
            };
          }
          return user;
        })
      );
    };

    const handleNewFriendRequest = (data) => {
      setRequestCount((prevCount) => prevCount + 1);
      toast.info(`${data.senderName} đã gửi lời mời kết bạn`, {
        toastId: `new-req-${data.senderId}`,
        position: "top-right",
        autoClose: 5000,
      });
      setUsers((prevUsers) =>
        prevUsers.map((u) => {
          if (u._id === data.senderId) {
            return { ...u, isIncomingRequest: true };
          }
          return u;
        })
      );
    };

    const handleFriendRequestAccepted = (data) => {
      toast.success(`${data.newFriendName} đã chấp nhận lời mời kết bạn`, {
        toastId: `accept-req-${data.newFriendId}`,
        position: "top-right",
        autoClose: 3000,
      });
      setUsers((prev) => {
        const updatedUsers = prev.map((user) => {
          if (user._id === data.newFriendId) {
            return {
              ...user,
              isFriend: true,
              isIncomingRequest: false,
            };
          }
          return user;
        });

        const userExists = updatedUsers.some((u) => u._id === data.newFriendId);
        if (!userExists) {
          updatedUsers.push({
            _id: data.newFriendId,
            displayName: data.newFriendName,
            avatar: data.newFriendAvatar,
            isFriend: true,
            lastMessage: null,
            hasUnread: false,
          });
        }
        return updatedUsers;
      });
    };

    const handleFriendRequestRejected = (data) => {
      setSentRequests((prev) => prev.filter((id) => id !== data.rejecterId));
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          if (user._id === data.rejecterId) {
            return {
              ...user,
              isSent: false,
              isIncomingRequest: false,
            };
          }
          return user;
        })
      );
    };

    socket.off("userDisconnected");
    socket.off("newFriendRequest");
    socket.off("friendRequestAccepted");
    socket.off("friendRequestRejected");

    socket.on("userDisconnected", handleUserDisconnected);
    socket.on("newFriendRequest", handleNewFriendRequest);
    socket.on("friendRequestAccepted", handleFriendRequestAccepted);
    socket.on("friendRequestRejected", handleFriendRequestRejected);

    return () => {
      socket.off("userDisconnected", handleUserDisconnected);
      socket.off("newFriendRequest", handleNewFriendRequest);
      socket.off("friendRequestAccepted", handleFriendRequestAccepted);
      socket.off("friendRequestRejected", handleFriendRequestRejected);
    };
  }, [socket, currentUser]);

  useEffect(() => {
    if (!socket) return;

    const handleUserRead = (data) => {
      const { readerId } = data;
      setUsers((prev) =>
        prev.map((u) => {
          if (u._id === readerId) {
            const lm = u.lastMessage
              ? { ...u.lastMessage, isRead: true }
              : u.lastMessage;
            return { ...u, hasUnread: false, lastMessage: lm };
          }
          return u;
        })
      );

      if (activeChat && !activeChat.members && activeChat._id === readerId) {
        setMessages((prev) =>
          prev.map((m) => {
            const senderId =
              typeof m.sender === "object" ? m.sender?._id : m.sender;
            if (senderId === currentUser._id) {
              return { ...m, isRead: true };
            }
            return m;
          })
        );
      }
    };

    const handleGroupUserRead = (data) => {
      const { groupId, readerId } = data;
      if (activeChat && activeChat.members && activeChat._id === groupId) {
        setMessages((prev) =>
          prev.map((m) => {
            const readBy = m.readBy ? Array.from(new Set(m.readBy)) : [];
            if (!readBy.includes(readerId)) {
              return { ...m, readBy: [...readBy, readerId] };
            }
            return m;
          })
        );
      }
      setGroups((prev) =>
        prev.map((g) => {
          if (g._id === groupId) {
            if (g.lastMessage) {
              const readBy = g.lastMessage.readBy
                ? Array.from(new Set(g.lastMessage.readBy))
                : [];
              if (!readBy.includes(readerId)) {
                return {
                  ...g,
                  lastMessage: {
                    ...g.lastMessage,
                    readBy: [...readBy, readerId],
                  },
                };
              }
            }
          }
          return g;
        })
      );
    };

    socket.on("userReadMessages", handleUserRead);
    socket.on("groupUserRead", handleGroupUserRead);

    return () => {
      socket.off("userReadMessages", handleUserRead);
      socket.off("groupUserRead", handleGroupUserRead);
    };
  }, [socket, activeChat, currentUser]);

  useEffect(() => {
    if (!socket) return;

    const handleUnifiedMessage = (data) => {
      const currentActiveChat = activeChatRef.current;
      setUsers((prevUsers) => {
        const updatedUsers = [...prevUsers];
        const targetId = data.isGroup ? data.receiverId : (data.senderId === currentUser._id ? data.receiverId : data.senderId);
        const index = updatedUsers.findIndex((u) => u._id === targetId);

        if (index !== -1) {
          const userToUpdate = updatedUsers[index];
          let previewContent = data.text;
          if (!previewContent && data.image) previewContent = "[Hình ảnh]";
          if (!previewContent && data.attachments?.length > 0) previewContent = "[Tệp đính kèm]";

          const updatedUser = {
            ...userToUpdate,
            lastMessage: {
              content: previewContent,
              senderId: data.senderId,
              createdAt: data.createdAt || new Date().toISOString(),
              isRead: false,
            },
            hasUnread: currentActiveChat?._id !== targetId,
          };

          updatedUsers.splice(index, 1);
          updatedUsers.unshift(updatedUser);
          return updatedUsers;
        } else {
          fetchNewConversation(targetId, data.isGroup, data);
          return prevUsers;
        }
      });

      const isViewingChat =
        (data.isGroup && currentActiveChat?._id === data.receiverId) ||
        (!data.isGroup &&
          (currentActiveChat?._id === data.senderId ||
            currentActiveChat?._id === data.receiverId));

      if (isViewingChat) {
        const isMeSender = data.senderId === currentUser._id;
        const computedIsRead = data.isGroup ? true : !isMeSender;

        setMessages((prev) => [
          ...prev,
          {
            sender: data.sender || {
              _id: data.senderId,
              displayName: "Người dùng",
              avatar: null,
            },
            text: data.text,
            image: data.image,
            type: data.type,
            files: data.files,
            attachments: data.attachments,
            createdAt: data.createdAt,
            isRead: computedIsRead,
          },
        ]);

        if (data.senderId !== currentUser._id) {
          if (data.isGroup) {
            socket.emit("markRead", {
              isGroup: true,
              groupId: data.receiverId,
              readerId: currentUser._id,
            });
          } else {
            socket.emit("markRead", {
              senderId: data.senderId,
              receiverId: currentUser._id,
            });
          }
        }
        setTimeout(
          () => scrollRef.current?.scrollIntoView({ behavior: "smooth" }),
          100
        );
      } else {
        if (data.type !== "system") {
          const sender = users.find((u) => u._id === data.senderId);
          const senderName = sender ? sender.displayName : "Ai đó";
          toast.info(`Tin nhắn mới từ ${senderName}`, {
            position: "top-right",
            autoClose: 3000,
            hideProgressBar: true,
          });
        }
      }
    };

    socket.on("getMessage", handleUnifiedMessage);

    return () => {
      socket.off("getMessage", handleUnifiedMessage);
    };
  }, [socket, currentUser, users, fetchNewConversation]);

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
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        setMessages(res.data);
        if (socket) {
          if (isGroup) {
            socket.emit("markRead", {
              isGroup: true,
              groupId: activeChat._id,
              readerId: currentUser._id,
            });
          } else {
            socket.emit("markRead", {
              senderId: activeChat._id,
              receiverId: currentUser._id,
            });
          }
        }
      } catch (err) {
        console.error("Lỗi fetch tin nhắn:", err);
      }
    };
    fetchMessages();
  }, [activeChat, currentUser, API_URL, socket]);

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

  // --- HANDLERS CHÍNH ---
  const handleScrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSelectUser = (user) => {
    setActiveChat(user);
    setUsers((prev) =>
      prev.map((u) => {
        if (u._id === user._id) {
          const lm = u.lastMessage
            ? { ...u.lastMessage, isRead: true }
            : u.lastMessage;
          return { ...u, hasUnread: false, lastMessage: lm };
        }
        return u;
      })
    );

    if (socket) {
      socket.emit("markRead", {
        senderId: user._id,
        receiverId: currentUser._id,
      });
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleGroupAdminChanged = (data) => {
      const { groupId, newAdminId } = data;
      setGroups((prevGroups) =>
        prevGroups.map((g) =>
          g._id === groupId ? { ...g, admin: newAdminId } : g
        )
      );
      if (activeChat?._id === groupId) {
        setActiveChat((prev) => ({ ...prev, admin: newAdminId }));
      }
    };

    const handleGroupRenamed = (data) => {
      const { groupId, newName, newAvatar } = data;
      setGroups((prevGroups) =>
        prevGroups.map((g) =>
          g._id === groupId ? { ...g, name: newName, avatar: newAvatar } : g
        )
      );
      if (activeChat?._id === groupId) {
        setActiveChat((prev) => ({
          ...prev,
          name: newName,
          avatar: newAvatar,
        }));
      }
    };

    const handleGroupMemberUpdated = (data) => {
      const { groupId, updatedGroup, removedMemberId, isVoluntaryLeave } = data;

      if (removedMemberId === currentUser._id) {
        try {
          socket.emit("leaveGroup", groupId);
        } catch (err) {
          console.error(err);
        }

        if (activeChat?._id === groupId) {
          setShowGroupMembers(false);
          setActiveChat(null);
        }
        const message = isVoluntaryLeave
          ? "Bạn đã rời khỏi nhóm"
          : "Bạn đã bị xóa khỏi nhóm";
        toast.info(message);
        setGroups((prevGroups) => prevGroups.filter((g) => g._id !== groupId));
        return;
      }

      if (updatedGroup) {
        setGroups((prevGroups) =>
          prevGroups.map((g) =>
            g._id === groupId ? { ...g, members: updatedGroup.members } : g
          )
        );
      }
      if (activeChat?._id === groupId && updatedGroup) {
        setActiveChat((prev) => ({ ...prev, members: updatedGroup.members }));
      }
    };

    const handleGroupDeleted = (data) => {
      const { groupId } = data;
      if (activeChat?._id === groupId) {
        setShowGroupMembers(false);
        setActiveChat(null);
      }
      setGroups((prevGroups) => prevGroups.filter((g) => g._id !== groupId));
      try {
        socket.emit("leaveGroup", groupId);
      } catch (err) {
        console.error(err);
      }
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
      senderAvatar: currentUser.avatar,
    });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stopTyping", {
        receiverId: activeChat._id,
        isGroup: isGroup,
        senderId: currentUser._id,
      });
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    const isUploading = uploadQueue.some(item => item.status === 'uploading');
    if (isUploading) {
      toast.warning("Vui lòng chờ file tải lên hoàn tất trước khi gửi!");
      return;
    }

    const attachmentIds = uploadQueue
      .filter(item => item.status === 'completed' && item.dbFileId)
      .map(item => item.dbFileId);

    // Nếu không có text và không có file nào thì dừng
    if (!newMessage.trim() && attachmentIds.length === 0) return;

    // Kiểm tra quyền trong nhóm
    if (activeChat?.members) {
      const isStillMember = activeChat.members.some((m) => m._id === currentUser._id);
      if (!isStillMember) {
        toast.error("Bạn đã bị xóa khỏi nhóm này");
        setActiveChat(null);
        return;
      }
    }

    try {
      const isGroup = activeChat.members ? true : false;
      const messagePayload = {
        sender: currentUser._id,
        receiver: activeChat._id,
        text: newMessage,
        attachments: attachmentIds,
        isGroup: isGroup,
        type: attachmentIds.length > 0 ? "file" : "text",
      };

      // GỌI API LƯU TIN NHẮN
      const res = await axios.post(`${API_URL}/api/messages`, messagePayload, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const savedMessage = res.data;

      // BẮN SOCKET CHO NGƯỜI NHẬN
      socket.emit("sendMessage", {
        ...savedMessage,
        createdAt: savedMessage.createdAt,
        senderId: currentUser._id,
        receiverId: activeChat._id,
        isGroup: isGroup,
        text: savedMessage.text,
        image: savedMessage.image,
        files: savedMessage.files,
        attachments: savedMessage.attachments,
      });

      // CẬP NHẬT GIAO DIỆN
      setNewMessage("");
      clearUploads();
      setShowEmoji(false);

    } catch (err) {
      console.error(err);
      toast.error("Lỗi gửi tin nhắn");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  const handleUpdateSuccess = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* SIDEBAR */}
      <Sidebar
        currentUser={currentUser}
        setShowProfile={setShowProfile}
        getAvatarUrl={getAvatarUrl}
        setShowCreateGroup={setShowCreateGroup}
        setShowRequestModal={setShowRequestModal}
        requestCount={requestCount}
        handleLogout={handleLogout}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearching={isSearching}
        groups={groups}
        handleSelectUser={handleSelectUser}
        usersToDisplay={usersToDisplay}
        users={users}
        sentRequests={sentRequests}
        checkIsOnline={checkIsOnline}
        renderLastMessage={renderLastMessage}
        handleAddFriend={handleAddFriend}
      />

      {/* CHAT WINDOW */}
      <div className="flex-1 flex flex-col bg-gray-50 h-full">
        {/* NƯỚC CỜ THẦN THÁNH: Bọc toàn bộ cột phải bằng FilePicker Kéo Thả */}
        {activeChat && currentChatUser ? (
          <FilePicker
            onFilesSelected={addFiles}
            disableClick={true} // Bật True để click vào chat không bị mở hộp thoại
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            <ChatWindow
              activeChat={activeChat}
              currentChatUser={currentChatUser}
              currentUser={currentUser}
              messages={messages}
              users={users}
              isFriend={isFriend}
              isTyping={isTyping}
              typingUserName={typingUserName}
              typingUserAvatar={typingUserAvatar}
              scrollRef={scrollRef}
              API_URL={API_URL}
              getAvatarUrl={getAvatarUrl}
              checkIsOnline={checkIsOnline}
              handleVideoCall={handleVideoCall}
              setShowGroupMembers={setShowGroupMembers}
              handleScrollToBottom={handleScrollToBottom}
            />

            <ChatInput
              showEmoji={showEmoji}
              setShowEmoji={setShowEmoji}
              onEmojiClick={(e) => setNewMessage(prev => prev + e.emoji)}
              handleSendMessage={handleSendMessage}
              newMessage={newMessage}
              handleInputChange={handleInputChange}
              uploadQueue={uploadQueue}
              addFiles={addFiles}
              removeUploadItem={removeUploadItem}
            />
          </FilePicker>
        ) : (
          /* Màn hình chờ khi chưa chọn ai để chat */
          <ChatWindow activeChat={null} currentChatUser={null} />
        )}
      </div>

      {/* MODALS */}
      {showProfile && (
        <UserProfileSidebar
          isOpen={showProfile}
          user={{ ...currentUser, avatar: getAvatarUrl(currentUser?.avatar) }}
          onClose={() => setShowProfile(false)}
          onUpdateSuccess={handleUpdateSuccess}
        />
      )}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        users={users}
        onCreateSuccess={(newGroup) => setGroups([newGroup, ...groups])}
      />
      {showRequestModal && (
        <FriendRequestModal
          onClose={() => setShowRequestModal(false)}
          onSuccess={fetchData}
          setRequestCount={setRequestCount}
          currentUser={currentUser}
        />
      )}
      {showGroupMembers && activeChat?.members && currentUser && (
        <GroupMembersModal
          group={activeChat}
          currentUser={currentUser}
          onClose={() => setShowGroupMembers(false)}
          onGroupUpdated={(updatedGroup) => {
            setActiveChat(updatedGroup);
            setGroups(
              groups.map((g) =>
                g._id === updatedGroup._id ? updatedGroup : g
              )
            );
            if (!updatedGroup.members.some((m) => m._id === currentUser._id)) {
              setShowGroupMembers(false);
              setActiveChat(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default Home;