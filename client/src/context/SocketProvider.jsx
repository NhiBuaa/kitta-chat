import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import io from "socket.io-client";
import { SocketContext } from "./SocketContext.js";

const AUTH_CHANGED_EVENT = "auth-changed";
const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";


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
    const [onlineUsers, setOnlineUsers] = useState([]);

    const userId = currentUser?._id || currentUser?.id || null;

    const socket = useMemo(() => {
        if (!userId) return null;

        return io(SERVER_URL, {
            transports: ["websocket"],
            query: { userId },
        });
    }, [userId]);

    useEffect(() => {
        const syncUser = () => {
            const nextUser = parseStoredUser();
            setCurrentUser(nextUser);

            if (!nextUser) {
                setOnlineUsers([]);
            }
        };

        window.addEventListener("storage", syncUser);
        window.addEventListener(AUTH_CHANGED_EVENT, syncUser);

        return () => {
            window.removeEventListener("storage", syncUser);
            window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
        };
    }, []);

    useEffect(() => {
        if (!socket || !userId) return;

        const handleConnect = () => {
            socket.emit("addNewUser", userId);
        };

        // GỌI API LẤY DANH SÁCH BẠN BÈ ONLINE LÚC VỪA VÀO APP
        const fetchInitialOnlineUsers = async () => {
            try {
                const res = await axios.get('/api/users/online-friends', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });

                if (res.data.success) {
                    // Chuyển mảng string IDs thành format object của bạn
                    const initialUsers = res.data.onlineUsers.map(id => ({ userId: id }));
                    setOnlineUsers(initialUsers);
                }
            } catch (error) {
                console.error("Lỗi lấy danh sách online:", error);
            }
        };

        // LẮNG NGHE DELTA UPDATE
        const handleUserStatusChanged = ({ userId: changedUserId, status }) => {
            setOnlineUsers((prev) => {
                const existingEntry = prev.find((user) => user.userId === changedUserId);

                if (status === "online") {
                    return existingEntry
                        ? prev
                        : [...prev, { userId: changedUserId, socketId: null, socketIds: [] }];
                }
                return prev.filter((user) => user.userId !== changedUserId);
            });
        };

        socket.on("connect", handleConnect);
        socket.on("userStatusChanged", handleUserStatusChanged);

        // Chạy hàm fetch ngay lập tức
        fetchInitialOnlineUsers();

        return () => {
            socket.off("connect", handleConnect);
            socket.off("userStatusChanged", handleUserStatusChanged);
            socket.disconnect();
        };
    }, [socket, userId]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers, currentUser }}>
            {children}
        </SocketContext.Provider>
    );
};
