import { useCallback } from "react";
import { toast } from "react-toastify";
import { axiosClient } from "@/services/api/axiosClient.js";
import { sendFriendRequest } from "@/services/api/friendApi.js";

/**
 * Tất cả các hàm thao tác với danh sách bạn bè và trạng thái request.
 * Không chứa socket listener – chỉ thuần logic cập nhật state.
 *
 * @param {object} deps
 * @param {string}   deps.API_URL
 * @param {Function} deps.setUsers       - setter cho friend/conversation list
 * @param {Function} deps.setActiveChat  - setter cho active chat
 * @param {Function} deps.setSentRequests
 */
export const useFriendActions = ({ API_URL, setUsers, setActiveChat, setSentRequests }) => {

    // Fetch conversation mới khi sidebar chưa có entry
    // Nhận fullURL thay vì tự ghép — tránh double /api/
    const fetchNewConversation = useCallback(async (fullUrl, messageData) => {
        try {
            const res = await axiosClient.get(fullUrl);

            if (res.data.success) {
                const newItem = res.data.data || res.data.user || res.data.group;
                let previewContent = messageData.text;
                if (!previewContent && messageData.image) previewContent = "[Hình ảnh]";

                setUsers((prev) => [
                    {
                        ...newItem,
                        lastMessage: {
                            content: previewContent,
                            senderId: messageData.senderId,
                            createdAt: messageData.createdAt || new Date().toISOString(),
                            isRead: false,
                        },
                        hasUnread: true,
                        unreadCount: 1,
                    },
                    ...prev,
                ]);
            }
        } catch (error) {
            console.error("[useFriendActions] fetchNewConversation error:", error);
        }
    }, [API_URL, setUsers]);

    // Patch users list + activeChat cùng lúc 
    const patchUsers = useCallback((targetUserId, updater) => {
        if (!targetUserId) return;
        setUsers((prev) => prev.map((u) => (u?._id === targetUserId ? updater(u) : u)));
        setActiveChat((prev) => {
            if (!prev || prev.members || prev._id !== targetUserId) return prev;
            return updater(prev);
        });
    }, [setUsers, setActiveChat]);

    // Đánh dấu quan hệ bạn bè thành công
    const markFriendshipActive = useCallback((friendData) => {
        if (!friendData?._id) return;

        const buildFriendState = (user = {}) => ({
            ...user,
            ...friendData,
            isFriend: true,
            isIncomingRequest: false,
            isReceived: false,
            isSent: false,
            lastMessage: user.lastMessage ?? friendData.lastMessage ?? null,
            hasUnread: user.hasUnread ?? false,
        });

        setSentRequests((prev) => prev.filter((id) => id !== friendData._id));

        setUsers((prev) => {
            const idx = prev.findIndex((u) => u._id === friendData._id);
            if (idx === -1) {
                return [
                    buildFriendState({ _id: friendData._id, displayName: friendData.displayName, avatar: friendData.avatar }),
                    ...prev,
                ];
            }
            const next = [...prev];
            next[idx] = buildFriendState(next[idx]);
            return next;
        });

        setActiveChat((prev) => {
            if (!prev || prev.members || prev._id !== friendData._id) return prev;
            return buildFriendState(prev);
        });
    }, [setUsers, setActiveChat, setSentRequests]);

    // Đánh dấu đã gửi lời mời kết bạn
    const markFriendRequestSent = useCallback((receiverId) => {
        if (!receiverId) return;
        setSentRequests((prev) => (prev.includes(receiverId) ? prev : [...prev, receiverId]));
        patchUsers(receiverId, (u) => ({ ...u, isSent: true, isIncomingRequest: false }));
    }, [patchUsers, setSentRequests]);

    // Xóa trạng thái đã gửi lời mời (bị từ chối / hủy)
    const clearSentFriendRequest = useCallback((targetUserId) => {
        if (!targetUserId) return;
        setSentRequests((prev) => prev.filter((id) => id !== targetUserId));
        patchUsers(targetUserId, (u) => ({ ...u, isSent: false, isIncomingRequest: false }));
    }, [patchUsers, setSentRequests]);

    // Button kết bạn từ Sidebar
    const handleAddFriend = useCallback(async (e, user) => {
        e.stopPropagation();
        try {
            await sendFriendRequest(user._id);
            markFriendRequestSent(user._id);
            toast.success("Đã gửi lời mời kết bạn");
        } catch (error) {
            console.error(error);
            toast.error("Lỗi gửi lời mời kết bạn");
        }
    }, [markFriendRequestSent]);

    return {
        fetchNewConversation,
        patchUsers,
        markFriendshipActive,
        markFriendRequestSent,
        clearSentFriendRequest,
        handleAddFriend,
    };
};
