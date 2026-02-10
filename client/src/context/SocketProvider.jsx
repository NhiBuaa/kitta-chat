import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { SocketContext } from "./SocketContext.js";

export const SocketProvider = ({ children }) => {
    const [socket] = useState(() => {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

        const newSocket = io(SERVER_URL, {
            transports: ['websocket'],
            // reconnection: true,
        });

        return newSocket;
    });

    // State lưu danh sách online
    const [onlineUsers, setOnlineUsers] = useState([]);

    useEffect(() => {
        return () => {
            if (socket) socket.disconnect();
        };
    }, [socket]);

    // lắng nghe sự kiện Online/Offline
    useEffect(() => {
        if (!socket) return;

        // Báo danh khi vừa vào
        const userString = localStorage.getItem("user");
        if (userString) {
            try {
                const user = JSON.parse(userString);
                socket.emit("addNewUser", user._id);
            } catch (error) {
                console.error("Lỗi parse user:", error);
            }
        }

        // Lắng nghe danh sách từ Server
        socket.on("getOnlineUsers", (res) => {
            setOnlineUsers(res);
        });

        return () => {
            socket.off("getOnlineUsers");
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );
};