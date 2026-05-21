import { useEffect } from "react";
import { toast } from "react-toastify";

export const registerFriendSocketListeners = ({
    socket,
    setRequestCount,
    patchUserEverywhere,
    markFriendRequestSent,
    markFriendshipActive,
    clearSentFriendRequest,
    markFriendshipRemoved,
    toast: toastApi = toast,
}) => {
    const handleFriendRequestSent = ({ receiverId }) => {
        markFriendRequestSent(receiverId);
    };

    const handleNewFriendRequest = (data) => {
        setRequestCount((prev) => prev + 1);
        toastApi.info(`${data.senderName} đã gửi lời mời kết bạn`, {
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

    const handleFriendRequestAccepted = (data) => {
        toastApi.success(`${data.newFriendName} đã chấp nhận lời mời kết bạn`, {
            toastId: `accept-req-${data.newFriendId}`,
            position: "top-right",
            autoClose: 3000,
        });

        patchUserEverywhere(data.newFriendId, (user) => ({
            ...user,
            _id: data.newFriendId,
            displayName: data.newFriendName ?? user?.displayName,
            avatar: data.newFriendAvatar ?? user?.avatar,
            isFriend: true,
            isIncomingRequest: false,
            isReceived: false,
            isSent: false,
        }));

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
        setRequestCount((prev) => Math.max(prev - 1, 0));
        if (data.action === "accepted" && data.friend) {
            patchUserEverywhere(data.friend._id, (user) => ({
                ...user,
                displayName: data.friend.displayName ?? user?.displayName,
                avatar: data.friend.avatar ?? user?.avatar,
                isFriend: true,
                isIncomingRequest: false,
                isReceived: false,
                isSent: false,
            }));
            markFriendshipActive(data.friend);
            return;
        }
        patchUserEverywhere(data.senderId, (user) => ({
            ...user,
            isIncomingRequest: false,
            isReceived: false,
        }));
    };

    const handleFriendRemoved = (data) => {
        markFriendshipRemoved?.(data);
    };

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
    socket.on("friendRemoved", handleFriendRemoved);
    socket.on("userStatusChanged", handleUserStatusChanged);

    return () => {
        socket.off("friendRequestSent", handleFriendRequestSent);
        socket.off("newFriendRequest", handleNewFriendRequest);
        socket.off("friendRequestAccepted", handleFriendRequestAccepted);
        socket.off("friendRequestRejected", handleFriendRequestRejected);
        socket.off("friendRequestHandled", handleFriendRequestHandled);
        socket.off("friendRemoved", handleFriendRemoved);
        socket.off("userStatusChanged", handleUserStatusChanged);
    };
};

export const useFriendSocket = ({
    socket,
    currentUser,
    setRequestCount,
    patchUserEverywhere,
    markFriendRequestSent,
    markFriendshipActive,
    clearSentFriendRequest,
    markFriendshipRemoved,
}) => {
    useEffect(() => {
        if (!socket || !currentUser) return;

        return registerFriendSocketListeners({
            socket,
            setRequestCount,
            patchUserEverywhere,
            markFriendRequestSent,
            markFriendshipActive,
            clearSentFriendRequest,
            markFriendshipRemoved,
        });
    }, [
        socket,
        currentUser,
        setRequestCount,
        patchUserEverywhere,
        markFriendRequestSent,
        markFriendshipActive,
        clearSentFriendRequest,
        markFriendshipRemoved,
    ]);
};
