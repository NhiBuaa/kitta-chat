import { useEffect } from "react";
import { toast } from "react-toastify";
import { audioManager } from "../utils/AudioManager";

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
    fetchNewConversation,
    setSearchResult,
}) => {
    useEffect(() => {
        if (!socket) return;

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
        const handleUnifiedMessage = (data) => {
            const currentActiveChat = activeChatRef.current;
            const senderId = data.senderId || data.sender?._id || data.sender;
            const receiverId = data.receiverId || data.receiver;
            const isMeSender = senderId === currentUser._id;

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
                        // Nếu đã có real _id (được server update qua callback) -> bỏ qua
                        if (existing._id && !String(existing._id).startsWith("temp_")) {
                            return prev;
                        }
                        // Nếu vẫn còn tempId -> cập nhật thành real message (từ server)
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

            const resolvedAttachments = Array.isArray(data.attachmentsData)
                ? data.attachmentsData
                : Array.isArray(data.attachments)
                    ? data.attachments
                    : [];

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

            // Cập nhật khung chat bên phải
            if (isViewingChat && !isMeSender) {
                setMessages((prev) => [
                    ...prev,
                    {
                        sender: data.sender || { _id: senderId, displayName: "Người dùng", avatar: null },
                        text: data.text,
                        image: data.image,
                        type: data.type,
                        files: data.files,
                        attachments: resolvedAttachments,
                        createdAt: data.createdAt,
                        isRead: true,
                    },
                ]);

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

            // Chuẩn bị nội dung preview cho sidebar
            let previewContent = data.text;
            if (!previewContent && data.image) previewContent = "[Hình ảnh]";
            if (!previewContent && resolvedAttachments.length > 0) {
                previewContent = resolvedAttachments.some((f) => f?.mimeType?.startsWith("image/"))
                    ? "[Hình ảnh]"
                    : "[Tệp đính kèm]";
            }

            const updateListWithPreview = (list = []) => {
                const updatedList = [...list];
                const index = updatedList.findIndex((item) => item._id === targetId);
                if (index === -1) return null;

                const itemToUpdate = updatedList[index];
                updatedList.splice(index, 1);
                updatedList.unshift({
                    ...itemToUpdate,
                    lastMessage: {
                        content: previewContent,
                        senderId,
                        createdAt: data.createdAt || new Date().toISOString(),
                        isRead: !isUnread,
                    },
                    hasUnread: isUnread,
                    unreadCount: isUnread ? (itemToUpdate.unreadCount || 0) + 1 : 0,
                });
                return updatedList;
            };

            // Cập nhật sidebar chính
            setUsers((prevUsers) => {
                const newList = updateListWithPreview(prevUsers);
                if (newList) return newList;
                // Conversation chưa có trong sidebar -> fetch thêm
                fetchNewConversation(
                    data.isGroup ? `/api/groups/${targetId}` : `/api/users/${targetId}`,
                    data
                );
                return prevUsers;
            });

            // Cập nhật danh sách tìm kiếm (nếu đang mở)
            setSearchResult((prev) => {
                if (!prev?.length) return prev;
                return updateListWithPreview(prev) || prev;
            });

            // Toast thông báo + phát âm thanh
            if (isUnread && data.type !== "system") {
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

        socket.on("userReadMessages", handleUserRead);
        socket.on("groupUserRead", handleGroupUserRead);
        socket.on("getMessage", handleUnifiedMessage);

        return () => {
            socket.off("userReadMessages", handleUserRead);
            socket.off("groupUserRead", handleGroupUserRead);
            socket.off("getMessage", handleUnifiedMessage);
        };
    }, [socket, currentUser, activeChatRef, setMessages, setUsers, setGroups, setHasNewUnread, scrollRef, fetchNewConversation, setSearchResult]);
};