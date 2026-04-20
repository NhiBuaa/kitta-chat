// src/hooks/usePresence.js
import { useContext } from "react";
import { SocketContext } from "../context/SocketContext";

export const usePresence = () => {
    const { onlineUsers } = useContext(SocketContext);

    const checkIsOnline = (targetUserOrId) => {
        const targetUserId =
            typeof targetUserOrId === "object" && targetUserOrId !== null
                ? targetUserOrId._id || targetUserOrId.id || targetUserOrId.userId
                : targetUserOrId;

        if (!targetUserId) return false;

        const isOnlineInSocket = onlineUsers.some(
            (user) => String(user.userId) === String(targetUserId),
        );
        if (isOnlineInSocket) return true;

        // Fallback: nếu payload user đã mang state activityStatus active/online thì vẫn coi như online
        if (typeof targetUserOrId === "object" && targetUserOrId !== null) {
            const activityState = targetUserOrId.activityStatus?.state;
            return activityState === "active" || activityState === "online";
        }

        return false;
    };

    return { onlineUsers, checkIsOnline };
};