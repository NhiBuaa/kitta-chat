import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { v4 as uuidv4 } from "uuid";
import { normalizeAttachment } from "../utils/normalizeAttachment";

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
    API_URL,
    uploadQueue,
    clearUploads,
    armAutoScrollLock,
    scrollRef,
    setUsers,
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
                const isGroup = Boolean(activeChat.members);
                const url = isGroup
                    ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true`
                    : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}`;

                const res = await axios.get(url, {
                    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                    signal: controller.signal,
                });

                if (isCancelled) return;

                if (res.data?.success) {
                    setMessages(res.data.data);
                    setHasMore(res.data.hasMore);
                    setUsers((prev) =>
                        prev.map((u) =>
                            u._id === activeChat._id ? { ...u, unreadCount: 0, hasUnread: false } : u
                        )
                    );
                }

                if (socket) {
                    if (activeChatIsGroup) {
                        socket.emit("markRead", { isGroup: true, groupId: activeChatId, readerId: currentUser._id });
                    } else {
                        socket.emit("markRead", { senderId: activeChatId, receiverId: currentUser._id });
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
    }, [activeChatId, activeChatIsGroup, currentUser?._id, API_URL, socket]);

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

        if (!navigator.onLine) {
            toast.error("Bạn đang mất kết nối mạng. Vui lòng kiểm tra lại!");
        }
        if (!socket || !socket.connected) {
            toast.error("Đang mất kết nối với máy chủ chat. Đang thử kết nối lại...");
        }

        const isUploading = uploadQueue.some((item) => item.status === "uploading");
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
            rawPayload: messagePayload,
        };

        setMessages((prev) => [...prev, optimisticMessage]);
        setNewMessage("");
        clearUploads();
        setShowEmoji(false);

        setTimeout(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }, 50);

        // Timeout 15s nếu server không phản hồi
        const timeoutId = setTimeout(() => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg._id === tempId && msg.status === "sending" ? { ...msg, status: "error" } : msg
                )
            );
        }, 15000);

        socket.emit("sendMessage", messagePayload, (res) => {
            clearTimeout(timeoutId);
            if (res?.success) {
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId
                            ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined }
                            : msg
                    )
                );
            } else {
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === tempId ? { ...msg, status: "error" } : msg
                    )
                );
                toast.error("Không thể gửi tin nhắn. Vui lòng thử lại!");
            }
        });
    }, [activeChat, currentUser, socket, uploadQueue, clearUploads, newMessage, scrollRef, setShowEmoji]);

    // Gửi lại tin nhắn lỗi 
    const handleRetryMessage = useCallback((failedMessage) => {
        if (!failedMessage.rawPayload) {
            toast.error("Dữ liệu tin nhắn đã mất, không thể thử lại.");
            return;
        }

        setMessages((prev) =>
            prev.map((msg) =>
                msg._id === failedMessage._id ? { ...msg, status: "sending" } : msg
            )
        );

        const retryTimeoutId = setTimeout(() => {
            setMessages((prev) =>
                prev.map((msg) =>
                    msg._id === failedMessage._id && msg.status === "sending"
                        ? { ...msg, status: "error" }
                        : msg
                )
            );
        }, 15000);

        socket.emit("sendMessage", failedMessage.rawPayload, (res) => {
            clearTimeout(retryTimeoutId);
            if (res?.success) {
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === failedMessage._id
                            ? { ...msg, _id: res.realId, status: "sent", rawPayload: undefined }
                            : msg
                    )
                );
            } else {
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg._id === failedMessage._id ? { ...msg, status: "error" } : msg
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
            const isGroup = Boolean(activeChat.members);
            const oldestMessageId = messages[0]._id;

            const url = isGroup
                ? `${API_URL}/api/messages/none/${activeChat._id}?isGroup=true&cursor=${oldestMessageId}`
                : `${API_URL}/api/messages/${currentUser._id}/${activeChat._id}?cursor=${oldestMessageId}`;

            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
    }, [activeChat, currentUser, API_URL, hasMore, messages, scrollRef]);

    // Reset nhanh khi chọn chat mới (gọi từ handleSelectUser) 
    const resetChatState = useCallback(() => {
        setMessages([]);
        setNewMessage("");
        setHasMore(true);
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        isFirstLoad.current = true;
    }, []);

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