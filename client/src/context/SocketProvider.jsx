import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { SocketContext } from "./SocketContext.js";

export const SocketProvider = ({ children }) => {
     // STATE
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [socket] = useState(() => {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
        
        // Lấy userId từ localStorage
        const userString = localStorage.getItem("user");
        let userId = "";
        if (userString) {
            try {
                const user = JSON.parse(userString);
                userId = user._id || "";
            } catch (error) {
                console.error("Lỗi parse user:", error);
            }
        }

        const newSocket = io(SERVER_URL, {
            transports: ['websocket'],
            query: {
                userId: userId
            }
            // reconnection: true,
        });

        return newSocket;
    });

    useEffect(() => {
        return () => {
            if (socket) socket.disconnect();
        };
    }, [socket]);

    // lắng nghe sự kiện Online/Offline
    useEffect(() => {
        if (!socket) {
            console.log("Socket not initialized");
            return;
        }

        console.log("Setting up socket listeners");

        // Lắng nghe danh sách từ Server
        socket.on("getOnlineUsers", (res) => {
            console.log("Nhận danh sách online users:", res);
            setOnlineUsers(res);
        });

        // Emit addNewUser khi socket connect (để register userId với server)
        const userString = localStorage.getItem("user");
        if (userString) {
            try {
                const user = JSON.parse(userString);
                const userId = user?._id;
                if (userId) {
                    console.log(`Emitting addNewUser event với userId: ${userId}`);
                    socket.emit("addNewUser", userId);
                } else {
                    console.log("user object tồn tại nhưng không có _id, không emit addNewUser");
                }
            } catch (error) {
                console.error("Lỗi parse user:", error);
            }
        } else {
            console.log("Không tìm thấy user trong localStorage");
        }

        return () => {
            console.log("Cleaning up socket listeners");
            socket.off("getOnlineUsers");
        };
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );
};