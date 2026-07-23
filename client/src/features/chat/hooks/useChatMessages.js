import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { SOCKET_EVENTS } from "@/constants/socketEvents.js";
import { getMessages } from "@/services/api/messageApi.js";
import { normalizeAttachment } from "@/utils/normalizeAttachment.js";
import {
    pendingQueueAdd,
    pendingQueueRemove,
    pendingQueueIncrementRetry,
    pendingQueueGetStaleAndClean,
    MAX_RETRY,
} from "@/utils/pendingQueue.js";

/**
 * Quản lý toàn bộ vòng đời tin nhắn:
 *  - Fetch khi đổi chat
 *  - Auto-scroll sau khi load lần đầu (useLayoutEffect)
 *  - Gửi tin (optimistic UI)
 *  - Retry khi lỗi
 *  - Load thêm tin cũ (infinite scroll)
 */
export const useChatMessages = ({
    activeChat,
    currentUser,
    socket,
    uploadQueue,
    clearUploads,
    armAutoScrollLock,
    scrollRef,
    setUsers,
    setGroups,
    scrollChatToBottom,
    setShowEmoji,
}) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isChatBootstrapping, setIsChatBootstrapping] = useState(false);
    const [hasFetchedActiveChat, setHasFetchedActiveChat] = useState(false);

    const isFirstLoad = useRef(true);
    const isLoadingMoreRef = useRef(false);

    const activeChatId = activeChat?._id || null;
    const activeChatIsGroup = Boolean(activeChat?.members);
    const activeChatKey = activeChatId
        ? `${activeChatIsGroup ? "group" : "user"}:${activeChatId}`
        : null;

    // Reset trạng thái khi đổi chat 
    useEffect(() => {
        if (!activeChatKey) {
            setIsChatBootstrapping(false);
            setHasFetchedActiveChat(false);
            return;
        }
        setIsChatBootstrapping(true);
        setHasFetchedActiveChat(false);
    }, [activeChatKey]);

    // Fetch messages 
    useEffect(() => {
        let isCancelled = false;
        const controller = new AbortController();

        const fetchMessages = async () => {
            if (!activeChat || !currentUser) return;

            setHasMore(true);
            setMessages([]);
            isFirstLoad.current = true;
            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
            armAutoScrollLock();

            try {
                const res = await getMessages({
                    activeChat,
                    currentUser,
                    signal: controller.signal,
                });

                if (isCancelled) return;

                if (res.data?.success) {
                    setMessages(res.data.data);
                    setHasMore(res.data.hasMore);
                    if (activeChatIsGroup) {
                        setGroups((prev) =>
                            prev.map((group) =>
                                group._id === activeChat._id
                                    ? { ...group, unreadCount: 0, hasUnread: false }
                                    : group
                            )
                        );
                    } else {
                        setUsers((prev) =>
                            prev.map((u) =>
                                u._id === activeChat._id ? { ...u, unreadCount: 0, hasUnread: false } : u
                            )
                        );
                    }
                }

                if (socket) {
                    if (activeChatIsGroup) {
                        socket.emit(SOCKET_EVENTS.MESSAGE_MARK_READ, { isGroup: true, groupId: activeChatId, readerId: currentUser._id });
                    } else {
                        socket.emit(SOCKET_EVENTS.MESSAGE_MARK_READ, { senderId: activeChatId, receiverId: currentUser._id });
                    }
                }

                setHasFetchedActiveChat(true);
            } catch (err) {
                if (
                    err?.code === "ERR_CANCELED" ||
                    err?.name === "CanceledError" ||
                    axios.isCancel?.(err)
                ) return;
                setHasFetchedActiveChat(true);
                console.error("[useChatMessages] fetchMessages error:", err);
            }
        };

        fetchMessages();
        return () => { isCancelled = true; controller.abort(); };
    }, [activeChatId, activeChatIsGroup, currentUser?._id, socket]);

    //  Auto-scroll lần đầu sau khi fetch xong 
    useLayoutEffect(() => {
        if (!activeChatKey || !hasFetchedActiveChat || !isChatBootstrapping) return;

        if (isFirstLoad.current && messages.length > 0) {
            scrollChatToBottom("auto");
            isFirstLoad.current = false;
        }

        let revealFrameId = null;
        const settleFrameId = requestAnimationFrame(() => {
            revealFrameId = requestAnimationFrame(() => {
                setIsChatBootstrapping(false);
            });
        });

        return () => {
            cancelAnimationFrame(settleFrameId);
            if (revealFrameId) cancelAnimationFrame(revealFrameId);
        };
    }, [activeChatKey, hasFetchedActiveChat, isChatBootstrapping, messages.length, scrollChatToBottom]);

    // Gửi tin nhắn (optimistic UI)
    const handleSendMessage = useCallback(async (e) => {
        e.preventDefault();

        // Kiểm tra socket trước khi gửi
        if (!socket) {
            toast.error("Đang mất kết nối với máy chủ chat.");
            return;
        }

        const isUploading = uploadQueue.some((item) =>
            ["waiting", "uploading", "processing"].includes(item.status)
        );
        if (isUploading) {
            toast.warning("Vui lòng chờ file tải lên hoàn tất trước khi gửi!");
            return;
        }

        const completedAttachments = uploadQueue.filter(
            (item) => item.status === "completed" && item.dbFileId
        );
        const attachmentIds = completedAttachments.map((item) => item.dbFileId);
        const attachmentMetas = completedAttachments.map(normalizeAttachment);

        if (!newMessage.trim() && attachmentIds.length === 0) return;

        if (activeChat?.members) {
            const isStillMember = activeChat.members.some((m) => m._id === currentUser._id);
            if (!isStillMember) {
                toast.error("Bạn đã bị xóa khỏi nhóm này");
                return;
            }
        }

        const isGroup = Boolean(activeChat.members);
        const tempId = `temp_${uuidv4()}`;
        const idempotencyKey = uuidv4(); // STABLE key – dùng cho deduplicate ở server
        const currentConvId = isGroup ? activeChat._id : activeChat.conversationId;

        const messagePayload = {
            conversationId: currentConvId,
            sender: currentUser._id,
            receiver: activeChat._id,
            receiverId: activeChat._id,
            text: newMessage,
            attachments: attachmentIds,
            attachmentsData: attachmentMetas,
            isGroup,
            type: attachmentIds.length > 0 ? "file" : "text",
            idempotencyKey,
            senderInfo: {
                _id: currentUser._id,
                displayName: currentUser.displayName,
                avatar: currentUser.avatar,
            },
        };

        const optimisticMessage = {
            _id: tempId,
            conversationId: currentConvId,
            sender: currentUser,
            text: newMessage,
            attachments: attachmentMetas,
            isGroup,
            type: messagePayload.type,
            createdAt: new Date().toISOString(),
            status: "sending",
            idempotencyKey,
            retryCount: 0,
            rawPayload: messagePayload,
        };

        armAutoScrollLock();
        setMessages((prev) => [...prev, optimisticMessage]);
        setNewMessage("");
        clearUploads();
        setShowEmoji(false);

        setTimeout(() => {
            scrollChatToBottom("smooth");
        }, 50);

        // Lưu vào PendingQueue (localStorage) reload detection
        pendingQueueAdd({
            idempotencyKey,
            tempId,
            payload: messagePayload,
            retryCount: 0,
        });

        // Hàm xử lý khi server phản hồi
        const handleServerResponse = (res) => {
            if (res?.success) {
                // Thành công -> xóa khỏi PendingQueue
                pendingQueueRemove(idempotencyKey);
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId
                            ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined }
                            : msg
                    )
                );
            } else {
                // Server trả lỗi -> giữ status error (không toast – inline indicator)
                pendingQueueRemove(idempotencyKey);
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId ? { ...msg, status: "error" } : msg
                    )
                );
            }
        };

        // Timeout 15s – không nhận được response -> auto error
        const timeoutId = setTimeout(() => {
            // Kiểm tra xem message còn trong trạng thái "sending" không
            setMessages((prev) => {
                const msg = prev.find((m) => m._id === tempId && m.status === "sending");
                if (!msg) return prev;
                return prev.map((m) =>
                    m._id === tempId ? { ...m, status: "error" } : m
                );
            });
        }, 15000);

        // emit – callback chỉ được gọi khi server xử lý xong
        socket.emit(SOCKET_EVENTS.MESSAGE_SEND, messagePayload, (res) => {
            clearTimeout(timeoutId);
            handleServerResponse(res);
        });
    }, [activeChat, currentUser, socket, uploadQueue, clearUploads, newMessage, armAutoScrollLock, scrollChatToBottom, setShowEmoji]);

    // Gửi lại tin nhắn lỗi (tap trực tiếp trên bubble)
    const handleRetryMessage = useCallback((failedMessage) => {
        if (!failedMessage.rawPayload) return;

        const tempId = failedMessage._id;
        const idempotencyKey = failedMessage.idempotencyKey;

        if (!idempotencyKey) {
            toast.error("Dữ liệu tin nhắn đã mất, không thể thử lại.");
            return;
        }

        // Kiểm tra retry count – pendingQueueIncrementRetry trả về null khi đã đạt MAX_RETRY
        const entryAfterIncrement = pendingQueueIncrementRetry(idempotencyKey);
        if (entryAfterIncrement === null) {
            // retryCount đã đạt MAX_RETRY -> không retry nữa
            // rawPayload vẫn giữ nguyên để user có thể "Sao chép nội dung"
            toast.info("Đã thử gửi nhiều lần. Bạn có thể sao chép nội dung.");
            return;
        }

        setMessages((prev) =>
            prev.map((msg) =>
                msg._id === tempId
                    ? { ...msg, status: "sending", retryCount: (msg.retryCount || 0) + 1 }
                    : msg
            )
        );

        // Timeout 15s
        const retryTimeoutId = setTimeout(() => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg._id === tempId && msg.status === "sending"
                        ? { ...msg, status: "error" }
                        : msg
                )
            );
        }, 15000);

        // Gửi lại với cùng idempotencyKey (server sẽ dedupe bằng upsert)
        socket.emit(SOCKET_EVENTS.MESSAGE_SEND, failedMessage.rawPayload, (res) => {
            clearTimeout(retryTimeoutId);
            if (res?.success) {
                pendingQueueRemove(idempotencyKey);
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId
                            ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined }
                            : msg
                    )
                );
            } else {
                pendingQueueRemove(idempotencyKey);
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId ? { ...msg, status: "error" } : msg
                    )
                );
            }
        });
    }, [socket]);

    // Load thêm tin nhắn cũ (infinite scroll) 
    const loadMoreMessages = useCallback(async () => {
        if (isLoadingMoreRef.current || !hasMore || messages.length === 0) return;

        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);

        const container = scrollRef.current;
        const previousScrollHeight = container?.scrollHeight;

        try {
            const oldestMessageId = messages[0]._id;

            const res = await getMessages({
                activeChat,
                currentUser,
                cursor: oldestMessageId,
            });

            if (res.data?.success) {
                const oldMessages = res.data.data;
                if (oldMessages.length === 0) {
                    setHasMore(false);
                    return;
                }

                setMessages((prev) => [...oldMessages, ...prev]);
                setHasMore(res.data.hasMore);

                // Chống giật: khôi phục vị trí scroll
                setTimeout(() => {
                    if (container) {
                        const newScrollHeight = container.scrollHeight;
                        container.scrollTop = Math.max(newScrollHeight - previousScrollHeight, 80);
                    }
                    isLoadingMoreRef.current = false;
                    setIsLoadingMore(false);
                }, 50);
            }
        } catch (error) {
            console.error("[useChatMessages] loadMoreMessages error:", error);
        } finally {
            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
        }
    }, [activeChat, currentUser, hasMore, messages, scrollRef]);

    // Reset nhanh khi chọn chat mới (gọi từ handleSelectUser)
    const resetChatState = useCallback(() => {
        setMessages([]);
        setNewMessage("");
        setHasMore(true);
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        isFirstLoad.current = true;
    }, []);

    /**
     * App startup: kiểm tra PendingQueue trong localStorage.
     * Những tin đang "sending" mà còn tồn đọng (app reload khi đang gửi)
     * -> set status = "error" để hiện inline retry indicator.
     *
     * Chỉ check khi có activeChat vì cần biết tin nhắn thuộc conversation nào.
     */
    useEffect(() => {
        if (!activeChatId || !currentUser?._id) return;

        const { stale } = pendingQueueGetStaleAndClean();

        if (stale.length === 0) return;

        // Map stale items theo tempId và cập nhật UI
        setMessages((prev) => {
            const staleIds = new Set(stale.map((item) => item.tempId));
            return prev.map((msg) => {
                if (staleIds.has(msg._id)) {
                    return { ...msg, status: "error", rawPayload: undefined };
                }
                return msg;
            });
        });
    }, [activeChatId, currentUser?._id]);

    return {
        messages,
        setMessages,
        newMessage,
        setNewMessage,
        hasMore,
        isLoadingMore,
        isChatBootstrapping,
        hasFetchedActiveChat,
        handleSendMessage,
        handleRetryMessage,
        loadMoreMessages,
        resetChatState,
    };
};
