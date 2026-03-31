import { useEffect } from "react";
import { toast } from "react-toastify";

/**
 * Đăng ký tất cả socket listener liên quan đến kết bạn:
 *  - newFriendRequest
 *  - friendRequestAccepted / Rejected / Handled
 *  - userStatusChanged (online/offline)
 */
export const useFriendSocket = ({
    socket,
    currentUser,
    setRequestCount,
    patchUserEverywhere,
    markFriendRequestSent,
    markFriendshipActive,
    clearSentFriendRequest,
}) => {
    useEffect(() => {
        if (!socket || !currentUser) return;

        // Xác nhận đã gửi lời mời (từ server)
        const handleFriendRequestSent = ({ receiverId }) => {
            markFriendRequestSent(receiverId);
        };

        // Nhận lời mời kết bạn mới
        const handleNewFriendRequest = (data) => {
            setRequestCount((prev) => prev + 1);
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
                isReceived: true,
                isSent: false,
            }));
        };

        // Lời mời được chấp nhận
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

        // Lời mời bị từ chối
        const handleFriendRequestRejected = (data) => {
            clearSentFriendRequest(data.rejecterId);
        };

        // Lời mời đã được xử lý (FriendRequestModal đóng lại)
        const handleFriendRequestHandled = (data) => {
            setRequestCount((prev) => Math.max(prev - 1, 0));
            if (data.action === "accepted" && data.friend) {
                markFriendshipActive(data.friend);
                return;
            }
            patchUserEverywhere(data.senderId, (user) => ({
                ...user,
                isIncomingRequest: false,
                isReceived: false,
            }));
        };

        // Online / offline
        const handleUserStatusChanged = ({ userId, status }) => {
            patchUserEverywhere(userId, (user) => ({
                ...user,
                activityStatus: {
                    ...(user.activityStatus || {}),
                    state: status,
                    ...(status === "offline" ? { lastSeen: new Date().toISOString() } : {}),
                },
            }));
        };

        socket.on("friendRequestSent", handleFriendRequestSent);
        socket.on("newFriendRequest", handleNewFriendRequest);
        socket.on("friendRequestAccepted", handleFriendRequestAccepted);
        socket.on("friendRequestRejected", handleFriendRequestRejected);
        socket.on("friendRequestHandled", handleFriendRequestHandled);
        socket.on("userStatusChanged", handleUserStatusChanged);

        return () => {
            socket.off("friendRequestSent", handleFriendRequestSent);
            socket.off("newFriendRequest", handleNewFriendRequest);
            socket.off("friendRequestAccepted", handleFriendRequestAccepted);
            socket.off("friendRequestRejected", handleFriendRequestRejected);
            socket.off("friendRequestHandled", handleFriendRequestHandled);
            socket.off("userStatusChanged", handleUserStatusChanged);
        };
    }, [socket, currentUser, setRequestCount, patchUserEverywhere, markFriendRequestSent, markFriendshipActive, clearSentFriendRequest]);
};