import { useEffect } from "react";
import { toast } from "react-toastify";

export const useChatSocket = ({
    socket,
    currentUser,
    activeChatRef,
    setUsers,
    setMessages,
    setGroups,
    setRequestCount,
    setSentRequests,
    setActiveChat,
    setShowGroupMembers,
    setIsTyping,
    setTypingUserName,
    setTypingUserAvatar,
    fetchNewConversation,
    scrollRef,
}) => {
    useEffect(() => {
        if (!socket || !currentUser) return;

        // NGƯỜI DÙNG & BẠN BÈ
        const handleUserDisconnected = (userId) => {
            setUsers((prev) =>
                prev.map((user) =>
                    user._id === userId
                        ? { ...user, activityStatus: { ...user.activityStatus, lastSeen: new Date().toISOString() } }
                        : user
                )
            );
        };

        const handleNewFriendRequest = (data) => {
            setRequestCount((prev) => prev + 1);
            toast.info(`${data.senderName} đã gửi lời mời kết bạn`, { toastId: `new-req-${data.senderId}`, autoClose: 5000 });
            setUsers((prev) => prev.map((u) => (u._id === data.senderId ? { ...u, isIncomingRequest: true } : u)));
        };

        const handleFriendRequestAccepted = (data) => {
            toast.success(`${data.newFriendName} đã chấp nhận kết bạn`, { toastId: `acc-req-${data.newFriendId}`, autoClose: 3000 });
            setUsers((prev) => {
                const updated = prev.map((u) => (u._id === data.newFriendId ? { ...u, isFriend: true, isIncomingRequest: false } : u));
                if (!updated.some((u) => u._id === data.newFriendId)) {
                    updated.push({ _id: data.newFriendId, displayName: data.newFriendName, avatar: data.newFriendAvatar, isFriend: true, hasUnread: false });
                }
                return updated;
            });
        };

        const handleFriendRequestRejected = (data) => {
            setSentRequests((prev) => prev.filter((id) => id !== data.rejecterId));
            setUsers((prev) => prev.map((u) => (u._id === data.rejecterId ? { ...u, isSent: false, isIncomingRequest: false } : u)));
        };

        // TIN NHẮN (NHẬN & ĐÃ ĐỌC)
        const handleUnifiedMessage = (data) => {
            const currentActiveChat = activeChatRef.current;
            const targetId = data.isGroup ? data.receiverId : data.senderId;

            setUsers((prevUsers) => {
                const updatedUsers = [...prevUsers];
                const index = updatedUsers.findIndex((u) => u._id === targetId);

                if (index !== -1) {
                    const userToUpdate = updatedUsers[index];
                    let previewContent = data.text;
                    if (!previewContent && data.image) previewContent = "[Hình ảnh]";
                    if (!previewContent && data.files?.length) previewContent = "[Tệp đính kèm]";

                    const updatedUser = {
                        ...userToUpdate,
                        lastMessage: { content: previewContent, senderId: data.senderId, createdAt: data.createdAt || new Date().toISOString(), isRead: false },
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
                (!data.isGroup && (currentActiveChat?._id === data.senderId || currentActiveChat?._id === data.receiverId));

            if (isViewingChat) {
                setMessages((prev) => [...prev, {
                    sender: data.sender || { _id: data.senderId, displayName: "Người dùng" },
                    text: data.text, image: data.image, files: data.files, type: data.type,
                    createdAt: data.createdAt, isRead: data.isGroup ? true : data.senderId !== currentUser._id,
                }]);

                if (data.senderId !== currentUser._id) {
                    socket.emit("markRead", {
                        isGroup: data.isGroup,
                        groupId: data.isGroup ? data.receiverId : undefined,
                        senderId: !data.isGroup ? data.senderId : undefined,
                        receiverId: currentUser._id,
                    });
                }
                setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            } else if (data.type !== "system") {
                const senderName = data.sender?.displayName || "Ai đó";
                toast.info(`Tin nhắn mới từ ${senderName}`, { autoClose: 3000, hideProgressBar: true });
            }
        };

        const handleUserRead = (data) => {
            const { readerId } = data;
            setUsers((prev) => prev.map((u) => {
                if (u._id === readerId) {
                    const lm = u.lastMessage ? { ...u.lastMessage, isRead: true } : u.lastMessage;
                    return { ...u, hasUnread: false, lastMessage: lm };
                }
                return u;
            }));

            if (activeChatRef.current && !activeChatRef.current.members && activeChatRef.current._id === readerId) {
                setMessages((prev) => prev.map((m) => {
                    const senderId = typeof m.sender === "object" ? m.sender?._id : m.sender;
                    if (senderId === currentUser._id) return { ...m, isRead: true };
                    return m;
                }));
            }
        };

        const handleGroupUserRead = (data) => {
            const { groupId, readerId } = data;
            if (activeChatRef.current && activeChatRef.current.members && activeChatRef.current._id === groupId) {
                setMessages((prev) => prev.map((m) => {
                    const readBy = m.readBy ? Array.from(new Set(m.readBy)) : [];
                    if (!readBy.includes(readerId)) return { ...m, readBy: [...readBy, readerId] };
                    return m;
                }));
            }
            // Update groups last message read status
            setGroups((prev) => prev.map((g) => {
                if (g._id === groupId && g.lastMessage) {
                    const readBy = g.lastMessage.readBy ? Array.from(new Set(g.lastMessage.readBy)) : [];
                    if (!readBy.includes(readerId)) {
                        return { ...g, lastMessage: { ...g.lastMessage, readBy: [...readBy, readerId] } };
                    }
                }
                return g;
            }));
        };

        // ĐANG GÕ
        const handleTyping = (data) => {
            if (activeChatRef.current?._id === data.chatId && data.senderId !== currentUser._id) {
                setIsTyping(true);
                if (data.isGroup) { setTypingUserName(data.senderName); setTypingUserAvatar(data.senderAvatar); }
            }
        };

        const handleStopTyping = (data) => {
            if (activeChatRef.current?._id === data.chatId && data.senderId !== currentUser._id) {
                setIsTyping(false); setTypingUserName(""); setTypingUserAvatar(null);
            }
        };

        // QUẢN LÝ NHÓM
        const handleGroupAdminChanged = (data) => {
            const { groupId, newAdminId } = data;
            setGroups((prev) => prev.map((g) => g._id === groupId ? { ...g, admin: newAdminId } : g));
            if (activeChatRef.current?._id === groupId) {
                setActiveChat((prev) => ({ ...prev, admin: newAdminId }));
            }
        };

        const handleGroupRenamed = (data) => {
            const { groupId, newName, newAvatar } = data;
            setGroups((prev) => prev.map((g) => g._id === groupId ? { ...g, name: newName, avatar: newAvatar } : g));
            if (activeChatRef.current?._id === groupId) {
                setActiveChat((prev) => ({ ...prev, name: newName, avatar: newAvatar }));
            }
        };

        const handleGroupMemberUpdated = (data) => {
            const { groupId, updatedGroup, removedMemberId, isVoluntaryLeave } = data;
            if (removedMemberId === currentUser._id) {
                try { socket.emit("leaveGroup", groupId); } catch (err) { console.error(err); }
                if (activeChatRef.current?._id === groupId) {
                    setShowGroupMembers(false);
                    setActiveChat(null);
                }
                toast.info(isVoluntaryLeave ? "Bạn đã rời khỏi nhóm" : "Bạn đã bị xóa khỏi nhóm");
                setGroups((prev) => prev.filter((g) => g._id !== groupId));
                return;
            }
            if (updatedGroup) {
                setGroups((prev) => prev.map((g) => g._id === groupId ? { ...g, members: updatedGroup.members } : g));
                if (activeChatRef.current?._id === groupId) {
                    setActiveChat((prev) => ({ ...prev, members: updatedGroup.members }));
                }
            }
        };

        const handleGroupDeleted = (data) => {
            const { groupId } = data;
            if (activeChatRef.current?._id === groupId) {
                setShowGroupMembers(false);
                setActiveChat(null);
            }
            setGroups((prev) => prev.filter((g) => g._id !== groupId));
            try { socket.emit("leaveGroup", groupId); } catch (err) { console.error(err); }
        };


        // ĐĂNG KÝ VÀ HỦY SỰ KIỆN
        socket.on("userDisconnected", handleUserDisconnected);
        socket.on("newFriendRequest", handleNewFriendRequest);
        socket.on("friendRequestAccepted", handleFriendRequestAccepted);
        socket.on("friendRequestRejected", handleFriendRequestRejected);

        socket.on("getMessage", handleUnifiedMessage);
        socket.on("userReadMessages", handleUserRead);
        socket.on("groupUserRead", handleGroupUserRead);

        socket.on("getTyping", handleTyping);
        socket.on("getStopTyping", handleStopTyping);

        socket.on("groupAdminChanged", handleGroupAdminChanged);
        socket.on("groupRenamed", handleGroupRenamed);
        socket.on("groupMemberUpdated", handleGroupMemberUpdated);
        socket.on("groupDeleted", handleGroupDeleted);

        return () => {
            socket.off("userDisconnected", handleUserDisconnected);
            socket.off("newFriendRequest", handleNewFriendRequest);
            socket.off("friendRequestAccepted", handleFriendRequestAccepted);
            socket.off("friendRequestRejected", handleFriendRequestRejected);

            socket.off("getMessage", handleUnifiedMessage);
            socket.off("userReadMessages", handleUserRead);
            socket.off("groupUserRead", handleGroupUserRead);

            socket.off("getTyping", handleTyping);
            socket.off("getStopTyping", handleStopTyping);

            socket.off("groupAdminChanged", handleGroupAdminChanged);
            socket.off("groupRenamed", handleGroupRenamed);
            socket.off("groupMemberUpdated", handleGroupMemberUpdated);
            socket.off("groupDeleted", handleGroupDeleted);
        };
    }, [socket, currentUser, fetchNewConversation]);
    
};