import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import io from "socket.io-client";
import { SocketContext } from "./SocketContext.js";

const AUTH_CHANGED_EVENT = "auth-changed";
// Event để sync tin nhắn bị miss giữa các React component
const SYNC_MESSAGE_EVENT = "sync-message-recovered";
const SERVER_URL = import.meta.env.VITE_API_URL || "";

const parseStoredUser = () => {
    const userString = localStorage.getItem("user");
    if (!userString) return null;
    try {
        return JSON.parse(userString);
    } catch {
        return null;
    }
};

export const SocketProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(() => parseStoredUser());
    const [onlineUsers, setOnlineUsers] = useState([]);
    // Dùng useState để trigger re-render khi socket thay đổi
    const [socket, setSocket] = useState(null);

    const userId = currentUser?._id || currentUser?.id || null;
    const socketRef = useRef(null);
    const lastMessageIdRef = useRef(localStorage.getItem("last_message_id") || null);
    // Debounce timer ref - theo dõi timeout để clear khi unmount
    const saveLastIdTimer = useRef(null);

    if (!userId && socket !== null) {
        setSocket(null);
    }

    // =========================================================
    // Lưu last_message_id với debounce (5s) + clear on unmount
    // Tránh ghi localStorage liên tục khi group chat sôi động
    // =========================================================
    const saveLastMessageId = useCallback((messageId) => {
        lastMessageIdRef.current = messageId;

        // Xóa timeout cũ nếu có
        if (saveLastIdTimer.current) {
            clearTimeout(saveLastIdTimer.current);
        }

        saveLastIdTimer.current = setTimeout(() => {
            localStorage.setItem("last_message_id", messageId);
            console.log("[Socket] Saved last_message_id:", messageId);
        }, 5000);
    }, []);

    // =========================================================
    // Sync tin nhắn bị miss (Redis Pub/Sub fire-and-forget backup)
    // Đặt TRƯỚC socket useEffect để tránh Temporal Dead Zone
    // =========================================================
    const syncMissedMessages = useCallback(async (afterId) => {
        if (!socketRef.current) return;

        try {
            const res = await axios.get('/api/messages/sync', {
                params: { after_id: afterId, limit: 100 },
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
            });

            if (res.data.success && res.data.messages?.length > 0) {
                // Dùng CustomEvent để giao tiếp giữa các React component
                // KHÔNG dùng socket.emit (gửi lên server thay vì component khác)
                window.dispatchEvent(
                    new CustomEvent(SYNC_MESSAGE_EVENT, {
                        detail: { messages: res.data.messages },
                    })
                );

                // Cập nhật last_message_id mới nhất
                const latest = res.data.messages[res.data.messages.length - 1];
                saveLastMessageId(latest._id);

                console.log(`[Socket] Synced ${res.data.messages.length} missed messages`);
            }
        } catch (err) {
            console.error("[Socket] Sync missed messages failed:", err);
        }
    }, [saveLastMessageId]);

    // =========================================================
    // Tạo Socket với useEffect - có cleanup ngắt kết nối
    // Dùng useState để Context trigger re-render
    // =========================================================
    useEffect(() => {
        // Không có user → không tạo socket
        if (!userId) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
            console.warn("[Socket] No token found, skipping connection");
            return;
        }

        // Tạo socket mới
        const newSocket = io(SERVER_URL || undefined, {
            // Chỉ dùng WebSocket - không long-polling
            // → Không cần sticky session trên Nginx
            // → WebSocket stateful, tự gắn với 1 container
            transports: ["websocket"],

            // Dùng auth object - server verify JWT để lấy userId
            // KHÔNG tin userId từ query string (chống spoofing)
            auth: { token },

            // Exponential backoff: delay tăng dần + random jitter
            // randomizationFactor = 0.5 → delay: 1s × (0.5-1.5)
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            randomizationFactor: 0.5,

            // Timeouts
            connectTimeout: 10000,
            pingTimeout: 20000,
            pingInterval: 25000,
        });

        socketRef.current = newSocket;
        // Cập nhật state để trigger re-render
        queueMicrotask(() => {
            if (socketRef.current === newSocket) {
                setSocket(newSocket);
            }
        });

        // ---- Connect ----
        newSocket.on("connect", () => {
            console.log("[Socket] Connected:", newSocket.id);
            newSocket.emit("addNewUser", userId);

            // Sync tin nhắn bị miss khi reconnect
            const lastId = lastMessageIdRef.current;
            if (lastId) {
                console.log("[Socket] Syncing missed messages after:", lastId);
                syncMissedMessages(lastId);
            }
        });

        newSocket.on("connect_error", (err) => {
            console.error("[Socket] Connection error:", err.message);
        });

        newSocket.on("disconnect", (reason) => {
            console.warn("[Socket] Disconnected:", reason);
        });

        // ---- User status ----
        newSocket.on("userStatusChanged", ({ userId: changedUserId, status }) => {
            setOnlineUsers((prev) => {
                const existing = prev.find((u) => u.userId === changedUserId);
                if (status === "online") {
                    return existing
                        ? prev
                        : [...prev, { userId: changedUserId }];
                }
                return prev.filter((u) => u.userId !== changedUserId);
            });
        });

        // ---- Lưu last_message_id khi nhận message ----
        newSocket.on("getMessage", (data) => {
            const msgId = data._id || data.realId;
            if (msgId) {
                saveLastMessageId(msgId);
            }
        });

        // ---- Initial online friends ----
        const fetchInitialOnlineUsers = async () => {
            try {
                const res = await axios.get('/api/users/online-friends', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    const initialUsers = res.data.onlineUsers.map((id) => ({
                        userId: id,
                    }));
                    setOnlineUsers(initialUsers);
                }
            } catch (error) {
                console.error("[Socket] Failed to fetch online friends:", error);
            }
        };

        fetchInitialOnlineUsers();

        // =========================================================
        // CLEANUP: Ngắt kết nối + clear debounce timer khi unmount
        // Quan trọng: Ngăn ghost sockets và memory leak
        // =========================================================
        return () => {
            newSocket.disconnect();
            newSocket.off("connect");
            newSocket.off("connect_error");
            newSocket.off("disconnect");
            newSocket.off("userStatusChanged");
            newSocket.off("getMessage");
            socketRef.current = null;
            setSocket(null);

            // Clear debounce timer khi logout/unmount
            if (saveLastIdTimer.current) {
                clearTimeout(saveLastIdTimer.current);
                saveLastIdTimer.current = null;
            }
        };
    }, [userId, syncMissedMessages, saveLastMessageId]);

    // Lưu last_message_id khi user đóng tab
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (lastMessageIdRef.current) {
                localStorage.setItem("last_message_id", lastMessageIdRef.current);
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    // =========================================================
    // Auth state sync (localStorage event)
    // =========================================================
    useEffect(() => {
        const syncUser = () => {
            const nextUser = parseStoredUser();
            setCurrentUser(nextUser);
            if (!nextUser) setOnlineUsers([]);
        };
        window.addEventListener("storage", syncUser);
        window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
        return () => {
            window.removeEventListener("storage", syncUser);
            window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers, currentUser }}>
            {children}
        </SocketContext.Provider>
    );
};
