import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { audioManager } from "@/utils/AudioManager.js";
import {
    appendIncomingChatMessage,
    getMessageId,
    getMessagePreviewContent,
    normalizeRecoveredMessage,
    resolveMessageAttachments,
    updateListWithMessagePreview,
    upsertCallLogMessage,
} from "@/features/chat/socket/messageSocketState.js";

/**
 * Đăng ký socket listeners liên quan đến tin nhắn:
 *  - getMessage -> cập nhật khung chat + sidebar + toast
 *  - userReadMessages / groupUserRead -> cập nhật trạng thái đã đọc
 */
export const useMessageSocket = ({
    socket,
    currentUser,
    activeChatRef,
    setMessages,
    setUsers,
    setGroups,
    setHasNewUnread,
    scrollRef,
    scrollChatToBottom,
    fetchNewConversation,
    setSearchResult,
}) => {
    const processedMessageIdsRef = useRef(new Set());

    useEffect(() => {
        if (!socket) return;

        const appendCallLogIfViewing = (data) => {
            const currentActiveChat = activeChatRef.current;
            const senderId = data.senderId || data.sender?._id || data.sender;
            const receiverId = data.receiverId || data.receiver?._id || data.receiver;
            const isViewingChat =
                currentActiveChat &&
                !currentActiveChat.members &&
                (currentActiveChat._id === senderId || currentActiveChat._id === receiverId);

            if (!isViewingChat) return false;

            setMessages((prev) => upsertCallLogMessage(prev, data, {
                createdAtFallback: new Date().toISOString(),
            }));

            setTimeout(() => {
                if (typeof scrollChatToBottom === "function") {
                    scrollChatToBottom("smooth");
                    return;
                }
                const container = scrollRef.current;
                if (container) {
                    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
                }
            }, 50);

            return true;
        };

        // userReadMessages
        const handleUserRead = ({ readerId }) => {
            setUsers((prev) =>
                prev.map((u) => {
                    if (u._id !== activeChatRef.current?._id) return u;
                    const lm = u.lastMessage ? { ...u.lastMessage, isRead: true } : u.lastMessage;
                    return { ...u, hasUnread: false, unreadCount: 0, lastMessage: lm };
                })
            );

            const activeChat = activeChatRef.current;
            if (activeChat && !activeChat.members && activeChat._id === readerId) {
                setMessages((prev) =>
                    prev.map((m) => {
                        const senderId = typeof m.sender === "object" ? m.sender?._id : m.sender;
                        return senderId === currentUser._id ? { ...m, isRead: true } : m;
                    })
                );
            }
        };

        // groupUserRead
        const handleGroupUserRead = ({ groupId, readerId }) => {
            const activeChat = activeChatRef.current;

            if (activeChat?.members && activeChat._id === groupId) {
                setMessages((prev) =>
                    prev.map((m) => {
                        const readBy = m.readBy ? Array.from(new Set(m.readBy)) : [];
                        if (!readBy.includes(readerId)) return { ...m, readBy: [...readBy, readerId] };
                        return m;
                    })
                );
            }

            setGroups((prev) =>
                prev.map((g) => {
                    if (g._id !== groupId || !g.lastMessage) return g;
                    const readBy = g.lastMessage.readBy
                        ? Array.from(new Set(g.lastMessage.readBy))
                        : [];
                    if (readBy.includes(readerId)) return g;
                    return { ...g, lastMessage: { ...g.lastMessage, readBy: [...readBy, readerId] } };
                })
            );
        };

        // getMessage (tin nhắn mới)
        const handleUnifiedMessage = (data, options = {}) => {
            const { suppressNotification = false } = options;
            const incomingMessageId = getMessageId(data);

            if (incomingMessageId && processedMessageIdsRef.current.has(incomingMessageId)) {
                return;
            }

            const currentActiveChat = activeChatRef.current;
            const senderId = data.senderId || data.sender?._id || data.sender;
            const receiverId = data.receiverId || data.receiver;
            const isMeSender = senderId === currentUser._id;
            const isCallLog = data.type === "call_log";
            const createdAtFallback = new Date().toISOString();

            /**
             * Deduplicate: khi retry thành công, sender nhận lại getMessage từ server
             * (server emit cho cả senderId). Kiểm tra xem đã có message với cùng
             * idempotencyKey trong UI chưa – nếu có thì bỏ qua (đã xử lý qua callback).
             */
            if (isMeSender && data.idempotencyKey) {
                setMessages((prev) => {
                    const existingIdx = prev.findIndex(
                        (m) => m.idempotencyKey === data.idempotencyKey
                    );
                    if (existingIdx !== -1) {
                        const existing = prev[existingIdx];
                        if (existing._id && !String(existing._id).startsWith("temp_")) {
                            return prev;
                        }
                        return prev.map((m) =>
                            m.idempotencyKey === data.idempotencyKey
                                ? {
                                    ...m,
                                    _id: data._id || m._id,
                                    status: "sent",
                                    rawPayload: undefined,
                                }
                                : m
                        );
                    }
                    return prev;
                });
            }

            const resolvedAttachments = resolveMessageAttachments(data);

            const targetId = data.isGroup
                ? receiverId
                : isMeSender
                    ? receiverId
                    : senderId;

            const isViewingChat =
                (data.isGroup && currentActiveChat?._id === receiverId) ||
                (!data.isGroup &&
                    (currentActiveChat?._id === senderId || currentActiveChat?._id === receiverId));

            const isUnread = !isViewingChat && !isMeSender;

            if (isViewingChat && (!isMeSender || isCallLog)) {
                setMessages((prev) => {
                    if (isCallLog) {
                        return upsertCallLogMessage(prev, data, { createdAtFallback });
                    }

                    return appendIncomingChatMessage(prev, data, {
                        senderId,
                        resolvedAttachments,
                    });
                });

                if (data.isGroup) {
                    socket.emit("markRead", { isGroup: true, groupId: receiverId, readerId: currentUser._id });
                } else {
                    socket.emit("markRead", { senderId, receiverId: currentUser._id });
                }

                setTimeout(() => {
                    const container = scrollRef.current;
                    if (!container) return;
                    const { scrollTop, scrollHeight, clientHeight } = container;
                    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
                    if (distanceToBottom > 150) {
                        setHasNewUnread(true);
                    } else {
                        container.scrollTo({ top: scrollHeight, behavior: "smooth" });
                    }
                }, 100);
            }

            const previewContent = getMessagePreviewContent(data, {
                isCallLog,
                resolvedAttachments,
            });

            const previewUpdate = {
                data,
                targetId,
                senderId,
                isUnread,
                isCallLog,
                previewContent,
                createdAtFallback,
            };

            if (data.isGroup) {
                setGroups((prevGroups) =>
                    updateListWithMessagePreview(prevGroups, previewUpdate) || prevGroups
                );
            } else {
                setUsers((prevUsers) => {
                    const newList = updateListWithMessagePreview(prevUsers, previewUpdate);
                    if (newList) return newList;
                    fetchNewConversation(`/api/users/${targetId}`, data);
                    return prevUsers;
                });

                setSearchResult((prev) => {
                    if (!prev?.length) return prev;
                    return updateListWithMessagePreview(prev, previewUpdate) || prev;
                });
            }

            if (incomingMessageId) {
                processedMessageIdsRef.current.add(incomingMessageId);
            }

            if (!suppressNotification && isUnread && data.type !== "system" && data.type !== "call_log") {
                try {
                    audioManager.playMessageNotification();
                    const senderName = data.sender?.displayName || "Ai đó";
                    const messageToast = data.isGroup
                        ? `${senderName} vừa gửi tin nhắn tới nhóm ${data.groupName || ""}`
                        : `Tin nhắn mới từ ${senderName}`;
                    toast.info(messageToast, { position: "top-right", autoClose: 3000, hideProgressBar: true });
                } catch (error) {
                    console.error("[useMessageSocket] toast error:", error);
                }
            }
        };

        const handleRecoveredMessages = (event) => {
            const messages = event?.detail?.messages;
            if (!Array.isArray(messages) || messages.length === 0) return;

            messages.forEach((message) => {
                handleUnifiedMessage(normalizeRecoveredMessage(message), {
                    suppressNotification: true,
                });
            });
        };

        const handleCallLogMessage = (data) => {
            appendCallLogIfViewing(data);
        };

        socket.on("userReadMessages", handleUserRead);
        socket.on("groupUserRead", handleGroupUserRead);
        socket.on("getMessage", handleUnifiedMessage);
        socket.on("callLogMessage", handleCallLogMessage);
        window.addEventListener("sync-message-recovered", handleRecoveredMessages);

        return () => {
            socket.off("userReadMessages", handleUserRead);
            socket.off("groupUserRead", handleGroupUserRead);
            socket.off("getMessage", handleUnifiedMessage);
            socket.off("callLogMessage", handleCallLogMessage);
            window.removeEventListener("sync-message-recovered", handleRecoveredMessages);
        };
    }, [socket, currentUser, activeChatRef, setMessages, setUsers, setGroups, setHasNewUnread, scrollRef, scrollChatToBottom, fetchNewConversation, setSearchResult]);
};
