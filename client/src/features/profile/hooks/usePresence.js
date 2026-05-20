// src/hooks/usePresence.js
import { useContext } from "react";
import { SocketContext } from "@/services/socket/SocketContext.js";
import { isUserOnline } from "./presenceState.js";

export const usePresence = () => {
    const { onlineUsers } = useContext(SocketContext);

    const checkIsOnline = (targetUserOrId) => isUserOnline(onlineUsers, targetUserOrId);

    return { onlineUsers, checkIsOnline };
};