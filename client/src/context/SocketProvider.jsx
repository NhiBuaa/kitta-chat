import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import { SocketContext } from "./SocketContext.js";

const parseStoredUser = () => {
    const userString = localStorage.getItem("user");
    if (!userString) return null;

    try {
        return JSON.parse(userString);
    } catch (error) {
        console.error("Loi parse user trong localStorage:", error);
        return null;
    }
};

export const SocketProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(() => parseStoredUser());

    const [socket] = useState(() => {
        const user = parseStoredUser();
        if (!user) return null;

        const userId = user._id || user.id;
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

        return io(SERVER_URL, {
            transports: ["websocket"],
            query: { userId },
        });
    });

    const [onlineUsers, setOnlineUsers] = useState([]);

    useEffect(() => {
        const syncUser = () => setCurrentUser(parseStoredUser());
        window.addEventListener("storage", syncUser);
        return () => window.removeEventListener("storage", syncUser);
    }, []);

    useEffect(() => {
        if (!socket) return;

        if (currentUser) {
            socket.emit("addNewUser", currentUser._id || currentUser.id);
        }

        const handleOnlineUsers = (users) => {
            setOnlineUsers(Array.isArray(users) ? users : []);
        };

        const handleUserStatusChanged = ({ userId, status }) => {
            setOnlineUsers((prev) => {
                const existingEntry = prev.find((user) => user.userId === userId);

                if (status === "online") {
                    return existingEntry ? prev : [...prev, { userId, socketId: null, socketIds: [] }];
                }

                return prev.filter((user) => user.userId !== userId);
            });
        };

        socket.on("getOnlineUsers", handleOnlineUsers);
        socket.on("userStatusChanged", handleUserStatusChanged);

        return () => {
            socket.off("getOnlineUsers", handleOnlineUsers);
            socket.off("userStatusChanged", handleUserStatusChanged);
            socket.disconnect();
        };
    }, [socket, currentUser]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers, currentUser }}>
            {children}
        </SocketContext.Provider>
    );
};
