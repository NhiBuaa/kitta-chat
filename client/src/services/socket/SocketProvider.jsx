import React, { useEffect, useState, useRef, useCallback } from "react";
import io from "socket.io-client";
import { SOCKET_EVENTS } from "@/constants/socketEvents.js";
import { syncMessages } from "@/services/api/messageApi.js";
import { getOnlineFriends } from "@/services/api/userApi.js";
import { SocketContext } from "@/services/socket/SocketContext.js";
import { dispatchCallHistoryRefresh } from "@/features/calls/context/callHistoryBadgeState.js";
import { getAccessToken, getStoredUser, setStoredUser } from "@/services/auth/authSession.js";

const AUTH_CHANGED_EVENT = "auth-changed";
// Event để sync tin nhắn bị miss giữa các React component
const SYNC_MESSAGE_EVENT = "sync-message-recovered";
const SERVER_URL = import.meta.env.VITE_API_URL || "";

const parseStoredUser = () => getStoredUser();

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
    // Heartbeat interval ref
    const heartbeatInterval = useRef(null);

    if (!userId && socket !== null) {
        setSocket(null);
    }

    // =========================================================
    // Lưu last_message_id với debounce (5s) + clear on unmount
    // Tránh ghi localStorage quá nhiều lần khi nhận nhiều tin nhắn
    // =========================================================
    const saveLastMessageId = useCallback((messageId) => {
        lastMessageIdRef.current = messageId;

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
    // =========================================================
    const syncMissedMessages = useCallback(async (afterId) => {
        if (!socketRef.current) return;

        try {
            const res = await syncMessages({ afterId });

            if (res.data.success && res.data.messages?.length > 0) {
                // Dùng CustomEvent để giao tiếp giữa các React component
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
        // Không có user -> không tạo socket
        if (!userId) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        const token = getAccessToken();
        if (!token) {
            console.warn("[Socket] No token found, skipping connection");
            return;
        }

        // Tạo socket mới
        const newSocket = io(SERVER_URL || undefined, {
            // Chỉ dùng WebSocket - không long-polling
            // -> Không cần sticky session trên Nginx
            // -> WebSocket stateful, tự gắn với 1 container
            transports: ["websocket"],

            // Dùng auth object - server verify JWT để lấy userId
            auth: { token },

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
            newSocket.emit(SOCKET_EVENTS.USER_CONNECTED, userId);
            dispatchCallHistoryRefresh();

            // Sync tin nhắn bị miss khi reconnect
            const lastId = lastMessageIdRef.current;
            if (lastId) {
                console.log("[Socket] Syncing missed messages after:", lastId);
                syncMissedMessages(lastId);
            }

            // HEARTBEAT: Gửi tín hiệu mỗi 20s để giữ Redis TTL 30s
            // Ngăn Ghost Online khi app crash/rớt mạng
            if (heartbeatInterval.current) {
                clearInterval(heartbeatInterval.current);
            }
            heartbeatInterval.current = setInterval(() => {
                if (newSocket.connected) {
                    newSocket.emit(SOCKET_EVENTS.USER_HEARTBEAT);
                    console.log("[Socket] Heartbeat sent");
                }
            }, 20000);
        });

        newSocket.on("connect_error", (err) => {
            console.error("[Socket] Connection error:", err.message);
        });

        newSocket.on("disconnect", (reason) => {
            console.warn("[Socket] Disconnected:", reason);
        });

        // ---- User status ----
        newSocket.on(SOCKET_EVENTS.USER_ONLINE, ({ userId: changedUserId, status }) => {
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
        newSocket.on(SOCKET_EVENTS.MESSAGE_RECEIVE, (data) => {
            const msgId = data._id || data.realId;
            if (msgId) {
                saveLastMessageId(msgId);
            }
        });

        newSocket.on(SOCKET_EVENTS.FILE_PROCESSED, (payload) => {
            window.dispatchEvent(
                new CustomEvent("file-processed", { detail: payload })
            );
        });

        newSocket.on(SOCKET_EVENTS.AVATAR_UPDATED, (payload) => {
            const updatedUser = payload?.user;
            const updatedUserId = updatedUser?._id || updatedUser?.id;
            if (updatedUserId && String(updatedUserId) === String(userId)) {
                setStoredUser(updatedUser);
                window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
            }
            window.dispatchEvent(
                new CustomEvent("avatar-updated", { detail: payload })
            );
        });

        // ---- Initial online friends (từ Redis HASH — O(1) HGETALL) ----
        const fetchInitialOnlineUsers = async () => {
            try {
                const res = await getOnlineFriends();
                if (res.data.success) {
                    // Backend trả về [{ userId, status, lastSeen }, ...]
                    setOnlineUsers(res.data.onlineUsers);
                }
            } catch (error) {
                console.error("[Socket] Failed to fetch online friends:", error);
            }
        };

        fetchInitialOnlineUsers();

        // =========================================================
        // CLEANUP: Ngắt kết nối + clear debounce timer + clear heartbeat khi unmount
        // Quan trọng: Ngăn ghost sockets và memory leak
        // =========================================================
        return () => {
            newSocket.disconnect();
            newSocket.off("connect");
            newSocket.off("connect_error");
            newSocket.off("disconnect");
            newSocket.off(SOCKET_EVENTS.USER_ONLINE);
            newSocket.off(SOCKET_EVENTS.MESSAGE_RECEIVE);
            newSocket.off(SOCKET_EVENTS.FILE_PROCESSED);
            newSocket.off(SOCKET_EVENTS.AVATAR_UPDATED);
            socketRef.current = null;
            setSocket(null);

            // Clear heartbeat interval khi logout/unmount
            if (heartbeatInterval.current) {
                clearInterval(heartbeatInterval.current);
                heartbeatInterval.current = null;
                console.log("[Socket] Heartbeat stopped");
            }

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
