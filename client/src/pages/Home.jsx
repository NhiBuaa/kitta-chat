import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from 'uuid';

// COMPONENTS
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import UserProfileSidebar from "../components/UserProfileSidebar";
import CreateGroupModal from "../components/CreateGroupModal";
import FriendRequestModal from "../components/FriendRequestModal";
import GroupMembersModal from "../components/GroupMembersModal";
import ChatInput from "../components/ChatInput";
import { FilePicker } from "../components/FilePicker";
import Loader from "../components/deco/Loader";

// CONTEXT & SERVICE
import { sendFriendRequest } from "../services/userService";
import { useSocket } from "../context/SocketContext";

// HOOK
import { useUploader } from "../hooks/useUploader";

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
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNewUnread, setHasNewUnread] = useState(false);

  // CONTEXT
  const { onlineUsers, socket } = useSocket();

  // REF
  const activeChatRef = useRef(null);
  const groupsRef = useRef([]);
  const scrollRef = useRef();
  const typingTimeoutRef = useRef(null);
  const isLoadingMoreRef = useRef(false);
  const isFirstLoad = useRef(true);

  // BIẾN
  const API_URL = import.meta.env.VITE_API_URL;

  // HOOK
  const { uploadQueue, addFiles, clearUploads, removeUploadItem } =
    useUploader();

  // HÀM XỬ LÝ GỌI VIDEO
  const handleVideoCall = () => {
    if (!currentChatUser) return;

    if (currentChatUser.members || currentChatUser.isGroup) {
      toast.warning("Chưa hỗ trợ gọi nhóm!");
      return;
    }

    const chatUserId = currentChatUser._id || currentChatUser.id;
    const url = `/video-call/${chatUserId}?name=${encodeURIComponent(currentChatUser.displayName)}&avatar=${encodeURIComponent(currentChatUser.avatar)}`;

    localStorage.setItem("activePartnerUserId", chatUserId);
    window.open(url, "_blank", "noopener,noreferrer");
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
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

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
  // Hàm cập nhật lại bên thanh sidebar
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
    [API_URL],
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

  const upsertGroup = useCallback((incomingGroup) => {
    if (!incomingGroup?._id) return;

    setGroups((prevGroups) => {
      const existingIndex = prevGroups.findIndex(
        (group) => group._id === incomingGroup._id,
      );

      if (existingIndex === -1) {
        return [incomingGroup, ...prevGroups];
      }

      const existingGroup = prevGroups[existingIndex];
      const mergedGroup = {
        ...existingGroup,
        ...incomingGroup,
        members: incomingGroup.members || existingGroup.members,
        admin: incomingGroup.admin || existingGroup.admin,
      };

      const nextGroups = [...prevGroups];
      nextGroups.splice(existingIndex, 1);
      nextGroups.unshift(mergedGroup);
      return nextGroups;
    });

    if (activeChatRef.current?._id === incomingGroup._id) {
      setActiveChat((prevChat) =>
        prevChat
          ? {
            ...prevChat,
            ...incomingGroup,
            members: incomingGroup.members || prevChat.members,
            admin: incomingGroup.admin || prevChat.admin,
          }
          : prevChat,
      );
    }
  }, []);

  const handleCreateGroupSuccess = useCallback(
    (newGroup) => {
      upsertGroup(newGroup);
      setActiveChat(newGroup);
    },
    [upsertGroup],
  );

  const patchUserEverywhere = useCallback((targetUserId, updater) => {
    if (!targetUserId) return;

    const applyPatch = (list = []) =>
      list.map((user) => (user?._id === targetUserId ? updater(user) : user));

    setUsers((prevUsers) => applyPatch(prevUsers));
    setSearchResult((prevUsers) => applyPatch(prevUsers));
    setActiveChat((prevChat) => {
      if (!prevChat || prevChat.members || prevChat._id !== targetUserId) {
        return prevChat;
      }

      return updater(prevChat);
    });
  }, []);

  const markFriendshipActive = useCallback((friendData) => {
    if (!friendData?._id) return;

    const buildFriendState = (user = {}) => ({
      ...user,
      ...friendData,
      isFriend: true,
      isIncomingRequest: false,
      isSent: false,
      lastMessage: user.lastMessage ?? friendData.lastMessage ?? null,
      hasUnread: user.hasUnread ?? false,
    });

    setSentRequests((prev) => prev.filter((id) => id !== friendData._id));
    setUsers((prevUsers) => {
      const existingIndex = prevUsers.findIndex((user) => user._id === friendData._id);

      if (existingIndex === -1) {
        return [
          buildFriendState({
            _id: friendData._id,
            displayName: friendData.displayName,
            avatar: friendData.avatar,
          }),
          ...prevUsers,
        ];
      }

      const nextUsers = [...prevUsers];
      nextUsers[existingIndex] = buildFriendState(nextUsers[existingIndex]);
      return nextUsers;
    });
    setSearchResult((prevUsers) =>
      prevUsers.map((user) =>
        user._id === friendData._id ? buildFriendState(user) : user,
      ),
    );
    setActiveChat((prevChat) => {
      if (!prevChat || prevChat.members || prevChat._id !== friendData._id) {
        return prevChat;
      }

      return buildFriendState(prevChat);
    });
  }, []);

  const markFriendRequestSent = useCallback(
    (receiverId) => {
      if (!receiverId) return;

      setSentRequests((prev) =>
        prev.includes(receiverId) ? prev : [...prev, receiverId],
      );
      patchUserEverywhere(receiverId, (user) => ({
        ...user,
        isSent: true,
        isIncomingRequest: false,
      }));
    },
    [patchUserEverywhere],
  );

  const clearSentFriendRequest = useCallback(
    (targetUserId) => {
      if (!targetUserId) return;

      setSentRequests((prev) => prev.filter((id) => id !== targetUserId));
      patchUserEverywhere(targetUserId, (user) => ({
        ...user,
        isSent: false,
        isIncomingRequest: false,
      }));
    },
    [patchUserEverywhere],
  );

  const handleAddFriend = async (e, user) => {
    e.stopPropagation();
    try {
      await sendFriendRequest(user._id);
      markFriendRequestSent(user._id);
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
      console.log("searchTerm:", searchTerm);
      try {
        const token = localStorage.getItem("token");
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const res = await axios.get(
          `${API_URL}/api/users/search?keyword=${encodeURIComponent(searchTerm)}`,
          config,
        );
        console.log("searchResult:", res.data.users);
        if (res.data.success) setSearchResult(res.data.users);
      } catch (error) {
        console.error("Lỗi tìm kiếm:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, API_URL]);

  const isSearchingMode = searchTerm.trim() !== "";

  const usersToDisplay = isSearchingMode ? searchResult : users;

  // SOCKET CONNECTION
  useEffect(() => {
    if (!socket || !currentUser) return;

    const handleFriendRequestSent = ({ receiverId }) => {
      markFriendRequestSent(receiverId);
    };

    const handleNewFriendRequest = (data) => {
      setRequestCount((prevCount) => prevCount + 1);
      toast.info(`${data.senderName} đã gửi lời mời kết bạn`, {
        toastId: `new-req-${data.senderId}`,
        position: "top-right",
        autoClose: 5000,
      });
      patchUserEverywhere(data.senderId, (user) => ({
        ...user,
        displayName: data.senderName || user.displayName,
        avatar: data.avatar ?? user.avatar,
        isIncomingRequest: true,
        isSent: false,
      }));
    };

    const handleFriendRequestAccepted = (data) => {
      toast.success(`${data.newFriendName} đã chấp nhận lời mời kết bạn`, {
        toastId: `accept-req-${data.newFriendId}`,
        position: "top-right",
        autoClose: 3000,
      });
      markFriendshipActive({
        _id: data.newFriendId,
        displayName: data.newFriendName,
        avatar: data.newFriendAvatar,
      });
    };

    const handleFriendRequestRejected = (data) => {
      clearSentFriendRequest(data.rejecterId);
    };

    const handleFriendRequestHandled = (data) => {
      setRequestCount((prevCount) => Math.max(prevCount - 1, 0));

      if (data.action === "accepted" && data.friend) {
        markFriendshipActive(data.friend);
        return;
      }

      patchUserEverywhere(data.senderId, (user) => ({
        ...user,
        isIncomingRequest: false,
      }));
    };

    const handleUserStatusChanged = ({ userId, status }) => {
      patchUserEverywhere(userId, (user) => {
        if (status === "online") {
          return {
            ...user,
            activityStatus: {
              ...(user.activityStatus || {}),
              state: "online",
            },
          };
        }

        return {
          ...user,
          activityStatus: {
            ...(user.activityStatus || {}),
            state: "offline",
            lastSeen: new Date().toISOString(),
          },
        };
      });
    };

    socket.on("userStatusChanged", handleUserStatusChanged);
    socket.on("friendRequestSent", handleFriendRequestSent);
    socket.on("newFriendRequest", handleNewFriendRequest);
    socket.on("friendRequestAccepted", handleFriendRequestAccepted);
    socket.on("friendRequestRejected", handleFriendRequestRejected);
    socket.on("friendRequestHandled", handleFriendRequestHandled);

    return () => {
      socket.off("userStatusChanged", handleUserStatusChanged);
      socket.off("friendRequestSent", handleFriendRequestSent);
      socket.off("newFriendRequest", handleNewFriendRequest);
      socket.off("friendRequestAccepted", handleFriendRequestAccepted);
      socket.off("friendRequestRejected", handleFriendRequestRejected);
      socket.off("friendRequestHandled", handleFriendRequestHandled);
    };
  }, [
    socket,
    currentUser,
    clearSentFriendRequest,
    markFriendRequestSent,
    markFriendshipActive,
    patchUserEverywhere,
  ]);

  useEffect(() => {
    if (users.length > 0) {
      setUsers((prevUsers) =>
        prevUsers.map((u) => ({
          ...u,
          // Kiểm tra xem ID của user có nằm trong mảng online của socket không
          isOnline: onlineUsers.some((onlineUser) => onlineUser.userId === u._id)
        }))
      );
    }
  }, [onlineUsers, users.length]);

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
        }),
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
          }),
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
          }),
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
        }),
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
      const senderId = data.senderId || data.sender?._id || data.sender;
      const receiverId = data.receiverId || data.receiver;

      // Cập nhật Sidebar
      setUsers((prevUsers) => {
        const updatedUsers = [...prevUsers];

        // Xác định ID của đối tác để đưa lên đầu
        const targetId = data.isGroup ? receiverId : senderId === currentUser._id ? receiverId : senderId;

        const index = updatedUsers.findIndex((u) => u._id === targetId);

        if (index !== -1) {
          const userToUpdate = updatedUsers[index];
          let previewContent = data.text;
          if (!previewContent && data.image) previewContent = "[Hình ảnh]";
          if (!previewContent && data.attachments?.length > 0)
            previewContent = "[Tệp đính kèm]";

          const updatedUser = {
            ...userToUpdate,
            lastMessage: {
              content: previewContent,
              senderId: senderId,
              createdAt: data.createdAt || new Date().toISOString(),
              isRead: false,
            },
            hasUnread: currentActiveChat?._id !== targetId,
          };

          updatedUsers.splice(index, 1);
          updatedUsers.unshift(updatedUser);
          return updatedUsers;
        } else {
          // Nếu có tin nhắn từ người lạ, gọi hàm lấy data
          fetchNewConversation(targetId, data.isGroup, data);
          return prevUsers;
        }
      });

      // Kiểm tra xem có đang mở đúng khung chat này không
      const isViewingChat =
        (data.isGroup && currentActiveChat?._id === receiverId) ||
        (!data.isGroup &&
          (currentActiveChat?._id === senderId ||
            currentActiveChat?._id === receiverId));

      if (isViewingChat) {
        const isMeSender = senderId === currentUser._id;

        // Chỉ chèn thêm tin nhắn vào màn hình nếu người gửi KHÔNG PHẢI LÀ MÌNH
        if (!isMeSender) {
          setMessages((prev) => [
            ...prev,
            {
              sender: data.sender || {
                _id: senderId,
                displayName: "Người dùng",
                avatar: null,
              },
              text: data.text,
              image: data.image,
              type: data.type,
              files: data.files,
              attachments: data.attachmentsData || data.attachments,
              createdAt: data.createdAt,
              isRead: data.isGroup ? true : false,
            },
          ]);

          // Bắn sự kiện đã đọc
          if (data.isGroup) {
            socket.emit("markRead", {
              isGroup: true,
              groupId: receiverId,
              readerId: currentUser._id,
            });
          } else {
            socket.emit("markRead", {
              senderId: senderId,
              receiverId: currentUser._id,
            });
          }

          setTimeout(() => {
            const container = scrollRef.current;
            if (container) {
              const { scrollTop, scrollHeight, clientHeight } = container;

              // Tính toán khoảng cách từ vị trí cuộn hiện tại tới đáy
              const distanceToBottom = scrollHeight - scrollTop - clientHeight;

              // Nếu người dùng đang mải đọc tin cũ
              if (distanceToBottom > 150) {
                setHasNewUnread(true);
              } else {
                // Nếu đang ở gần đáy, mượt mà cuộn thẳng xuống tin mới nhất
                container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
              }
            }
          }, 100);
        }
      } else {
        // Xử lý thông báo
        if (data.type !== "system" && senderId !== currentUser._id) {
          try {
            let messageToast = "";

            if (data.isGroup) {
              const groupName = data.groupName;
              const senderName = data.sender?.displayName;
              messageToast = `${senderName} vừa gửi một tin nhắn tới nhóm ${groupName}`;
            } else {
              const sender = users.find((u) => u._id === senderId);
              const senderName = sender ? sender.displayName : (data.sender?.displayName || "Ai đó");
              messageToast = `Tin nhắn mới từ ${senderName}`;
            }

            toast.info(messageToast, {
              position: "top-right",
              autoClose: 3000,
              hideProgressBar: true,
            });
          } catch (error) {
            console.error("Lỗi không hiển thị toast: ", error);
          }
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

      // Reset lại khi đổi đoạn chat
      setHasMore(true);
      setMessages([]);
      isFirstLoad.current = true;
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);

      try {
        const isGroup = activeChat.members ? true : false;

        // Gọi API lần đầu
        const url = isGroup
          ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true`
          : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}`;

        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });

        if (res.data && res.data.success) {
          setMessages(res.data.data);
          setHasMore(res.data.hasMore);
        }

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

  // HANDLERS
  const handleScrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setHasNewUnread(false);
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
      }),
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

    const handleGroupUpserted = (data) => {
      const { group, action, actorId, addedMemberId } = data || {};
      if (!group?._id || !currentUser?._id) return;

      const existedBefore = groupsRef.current.some((g) => g._id === group._id);
      upsertGroup(group);

      const isCurrentUserAdded =
        action === "member-added" && addedMemberId === currentUser._id;
      const isInvitedWhenCreated =
        action === "created" &&
        actorId !== currentUser._id &&
        group.members?.some((member) => member._id === currentUser._id);

      if (!existedBefore && (isCurrentUserAdded || isInvitedWhenCreated)) {
        toast.info(`Bạn vừa được thêm vào nhóm "${group.name}"`, {
          toastId: `group-upsert-${group._id}`,
        });
      }
    };

    const handleGroupAdminChanged = (data) => {
      const { groupId, newAdminId } = data;
      setGroups((prevGroups) =>
        prevGroups.map((g) =>
          g._id === groupId ? { ...g, admin: newAdminId } : g,
        ),
      );
      if (activeChat?._id === groupId) {
        setActiveChat((prev) => ({ ...prev, admin: newAdminId }));
      }
    };

    const handleGroupRenamed = (data) => {
      const { groupId, newName, newAvatar } = data;
      setGroups((prevGroups) =>
        prevGroups.map((g) =>
          g._id === groupId ? { ...g, name: newName, avatar: newAvatar } : g,
        ),
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
        upsertGroup(updatedGroup);
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

    socket.on("groupUpserted", handleGroupUpserted);
    socket.on("groupAdminChanged", handleGroupAdminChanged);
    socket.on("groupRenamed", handleGroupRenamed);
    socket.on("groupMemberUpdated", handleGroupMemberUpdated);
    socket.on("groupDeleted", handleGroupDeleted);

    return () => {
      socket.off("groupUpserted", handleGroupUpserted);
      socket.off("groupAdminChanged", handleGroupAdminChanged);
      socket.off("groupRenamed", handleGroupRenamed);
      socket.off("groupMemberUpdated", handleGroupMemberUpdated);
      socket.off("groupDeleted", handleGroupDeleted);
    };
  }, [socket, activeChat, currentUser, upsertGroup]);

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

  // Gửi tin nhắn
  const handleSendMessage = async (e) => {
    e.preventDefault();

    // CHẶN NẾU TRÌNH DUYỆT MẤT MẠNG INTERNET
    if (!navigator.onLine) {
      toast.error("Bạn đang mất kết nối mạng. Vui lòng kiểm tra lại!");
    }

    // CHẶN NẾU BỊ ĐỨT KẾT NỐI VỚI SERVER SOCKET
    if (!socket || !socket.connected) {
      toast.error("Đang mất kết nối với máy chủ chat. Đang thử kết nối lại...");
    }

    const isUploading = uploadQueue.some((item) => item.status === "uploading");
    if (isUploading) {
      toast.warning("Vui lòng chờ file tải lên hoàn tất trước khi gửi!");
      return;
    }

    const completedAttachments = uploadQueue.filter((item) => item.status === "completed" && item.dbFileId);
    const attachmentIds = completedAttachments.map((item) => item.dbFileId);

    // Nếu không có text và không có file nào thì dừng
    if (!newMessage.trim() && attachmentIds.length === 0) return;

    // Kiểm tra quyền trong nhóm
    if (activeChat?.members) {
      const isStillMember = activeChat.members.some(
        (m) => m._id === currentUser._id,
      );
      if (!isStillMember) {
        toast.error("Bạn đã bị xóa khỏi nhóm này");
        setActiveChat(null);
        return;
      }
    }

    try {
      const isGroup = activeChat.members ? true : false;
      const tempId = `temp_${uuidv4()}`;
      let currentConvId = activeChat.conversationId;

      if (isGroup) {
        currentConvId = activeChat._id;
      }

      const messagePayload = {
        conversationId: currentConvId,
        sender: currentUser._id,
        receiver: activeChat._id,
        receiverId: activeChat._id,
        text: newMessage,
        attachments: attachmentIds,
        attachmentsData: completedAttachments,
        isGroup: isGroup,
        type: attachmentIds.length > 0 ? "file" : "text",
        senderInfo: {
          _id: currentUser._id,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar
        }
      };

      //  Hiển thị lên màn hình ngay lập tức
      const optimisticMessage = {
        _id: tempId,
        conversationId: currentConvId,
        sender: currentUser,
        text: newMessage,
        attachments: completedAttachments,
        isGroup: isGroup,
        type: messagePayload.type,
        createdAt: new Date().toISOString(),
        status: "sending",
        rawPayload: messagePayload
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setNewMessage("");
      clearUploads();
      setShowEmoji(false);

      // Khi vừa gửi tin nhắn thì kéo xuống để hiển thị cho chính mình luôn
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth"
          });
        }
      }, 50);

      // Sau 15s nếu server không phản hồi thì đánh dấu là lỗi
      const timeoutId = setTimeout(() => {
        setMessages(prev => prev.map(msg =>
          (msg._id === tempId && msg.status === "sending")
            ? { ...msg, status: "error" } : msg
        ));
      }, 15000);

      // Gửi tin nhắn qua socket
      socket.emit("sendMessage", messagePayload, (res) => {
        clearTimeout(timeoutId);
        if (res && res.success) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg._id === tempId
                ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined } : msg
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg._id === tempId ? { ...msg, status: "error" } : msg
            )
          );
          toast.error("Không thể gửi tin nhắn. Vui lòng thử lại!");
        }
      })

    } catch (err) {
      console.error(err);
      toast.error("Lỗi gửi tin nhắn");
    }
  };

  const handleLogout = () => {
    // Ngắt kết nối socket
    if (socket) {
      socket.disconnect();
    }

    // Dọn dẹp LocalStorage/SessionStorage
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth-changed"));

    setCurrentUser(null);

    window.location.href = "/login";
  };

  const handleUpdateSuccess = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  const handleRetryMessage = (failedMessage) => {
    // Không có payload thì không thể gửi lại
    if (!failedMessage.rawPayload) {
      toast.error("Dữ liệu tin nhắn đã mất, không thể thử lại.");
      return;
    }

    // Đổi trạng thái UI quay lại thành "Đang gửi..."
    setMessages((prev) => prev.map((msg) =>
      msg._id === failedMessage._id ? { ...msg, status: "sending" } : msg
    ));

    // Khởi tạo lại một Timeout 15s mới cho lần thử lại này
    const retryTimeoutId = setTimeout(() => {
      setMessages(prev => prev.map(msg =>
        (msg._id === failedMessage._id && msg.status === "sending")
          ? { ...msg, status: "error" } : msg
      ));
    }, 15000);

    // Bắn Socket gửi lại với payload cũ
    socket.emit("sendMessage", failedMessage.rawPayload, (res) => {
      clearTimeout(retryTimeoutId); // Có phản hồi thì hủy hẹn giờ

      if (res && res.success) {
        setMessages((prev) => prev.map((msg) =>
          msg._id === failedMessage._id
            ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined }
            : msg
        ));
      } else {
        setMessages((prev) => prev.map((msg) =>
          msg._id === failedMessage._id ? { ...msg, status: "error" } : msg
        ));
      }
    });
  };

  // Hiển thị thêm tin nhắn khi cuộn lên
  const loadMoreMessages = async () => {
    // Chặn nếu đang tải, hoặc đã hết tin nhắn, hoặc chưa có tin nào
    if (isLoadingMoreRef.current || !hasMore || messages.length === 0) return;

    isLoadingMoreRef.current = true;

    setIsLoadingMore(true);
    const container = scrollRef.current;
    const previousScrollHeight = container?.scrollHeight; // Lưu chiều cao cũ

    try {
      const isGroup = activeChat.members ? true : false;
      const oldestMessageId = messages[0]._id; // Lấy ID của tin nhắn cũ nhất đang hiển thị

      // Thêm cursor vào URL
      const url = isGroup
        ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true&cursor=${oldestMessageId}`
        : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}?cursor=${oldestMessageId}`;

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      if (res.data && res.data.success) {
        const oldMessages = res.data.data;

        if (oldMessages.length === 0) {
          setHasMore(false);
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
          return;
        }

        // Nối tin cũ lên trước mảng tin nhắn hiện tại
        setMessages(prev => [...oldMessages, ...prev]);
        setHasMore(res.data.hasMore);

        // Chống giật màn hình
        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - previousScrollHeight;
          }

          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
        }, 50);
      }
    } catch (error) {
      console.error("Lỗi tải thêm tin nhắn:", error);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  useLayoutEffect(() => {
    // Chỉ chạy nếu đây là lần tải đầu tiên và đã có tin nhắn để cuộn
    if (isFirstLoad.current && messages.length > 0) {
      const container = scrollRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "auto",
        });

        isFirstLoad.current = false;
      }
    }
  }, [messages]);

  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader/>
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
        {/*Cho phép kéo thả file*/}
        {activeChat && currentChatUser ? (
          <FilePicker
            onFilesSelected={addFiles}
            disableClick={true}
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
              handleRetryMessage={handleRetryMessage}
              loadMoreMessages={loadMoreMessages}
              isLoadingMore={isLoadingMore}
              setHasNewUnread={setHasNewUnread}
              hasNewUnread={hasNewUnread}
            />

            <ChatInput
              showEmoji={showEmoji}
              setShowEmoji={setShowEmoji}
              onEmojiClick={(e) => setNewMessage((prev) => prev + e.emoji)}
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
        onCreateSuccess={handleCreateGroupSuccess}
      />
      {showRequestModal && (
        <FriendRequestModal
          onClose={() => setShowRequestModal(false)}
          setRequestCount={setRequestCount}
        />
      )}
      {showGroupMembers && activeChat?.members && currentUser && (
        <GroupMembersModal
          group={activeChat}
          currentUser={currentUser}
          onClose={() => setShowGroupMembers(false)}
          onGroupUpdated={(updatedGroup) => {
            upsertGroup(updatedGroup);
            setActiveChat(updatedGroup);
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
