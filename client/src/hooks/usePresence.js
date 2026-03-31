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

        return onlineUsers.some(
            (user) => String(user.userId) === String(targetUserId),
        );
    };

    return { onlineUsers, checkIsOnline };
};
