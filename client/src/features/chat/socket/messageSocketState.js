export const getMessageId = (data) => data?._id || null;

export const getCallHistoryId = (data) => data?.callData?.callHistoryId || null;

export const resolveMessageAttachments = (data) => {
    if (Array.isArray(data?.attachmentsData)) return data.attachmentsData;
    if (Array.isArray(data?.attachments)) return data.attachments;
    return [];
};

export const normalizeRecoveredMessage = (message) => {
    const conversationId = message?.conversationId || "";
    const isRecoveredGroup =
        typeof message?.isGroup === "boolean"
            ? message.isGroup
            : Boolean(conversationId && !conversationId.includes("_"));

    return {
        ...message,
        isGroup: isRecoveredGroup,
        receiverId: isRecoveredGroup
            ? conversationId
            : message?.receiverId || message?.receiver,
    };
};

export const upsertCallLogMessage = (prev, data, { createdAtFallback } = {}) => {
    const callHistoryId = getCallHistoryId(data);
    const existingIndex = prev.findIndex((message) =>
        (data?._id && message._id === data._id) ||
        (callHistoryId && message.callData?.callHistoryId === callHistoryId)
    );

    const nextMessage = {
        _id: data._id,
        sender: data.sender,
        receiver: data.receiver,
        text: data.text || "",
        type: "call_log",
        attachments: [],
        callData: data.callData,
        createdAt: data.createdAt || createdAtFallback,
        isRead: true,
    };

    if (existingIndex === -1) {
        return [...prev, nextMessage];
    }

    return prev.map((message, index) =>
        index === existingIndex
            ? {
                ...message,
                ...nextMessage,
                callData: {
                    ...message.callData,
                    ...nextMessage.callData,
                },
            }
            : message
    );
};

export const appendIncomingChatMessage = (prev, data, { senderId, resolvedAttachments }) => {
    const incomingMessageId = getMessageId(data);
    if (incomingMessageId && prev.some((message) => message._id === incomingMessageId)) {
        return prev;
    }

    return [
        ...prev,
        {
            _id: data._id,
            sender: data.sender || { _id: senderId, displayName: "Người dùng", avatar: null },
            receiver: data.receiver,
            text: data.text,
            image: data.image,
            type: data.type,
            files: data.files,
            attachments: resolvedAttachments,
            callData: data.callData,
            createdAt: data.createdAt,
            isRead: true,
        },
    ];
};

export const getMessagePreviewContent = (data, { isCallLog, resolvedAttachments }) => {
    if (data?.text) return data.text;

    if (isCallLog) {
        return data.callData?.type === "video"
            ? "[Cuộc gọi video]"
            : "[Cuộc gọi thoại]";
    }

    if (data?.image) return "[Hình ảnh]";

    if (resolvedAttachments.length > 0) {
        return resolvedAttachments.some((file) => file?.mimeType?.startsWith("image/"))
            ? "[Hình ảnh]"
            : "[Tệp đính kèm]";
    }

    return data?.text;
};

export const updateListWithMessagePreview = (
    list = [],
    { data, targetId, senderId, isUnread, isCallLog, previewContent, createdAtFallback }
) => {
    const updatedList = [...list];
    const index = updatedList.findIndex((item) => item._id === targetId);
    if (index === -1) return null;

    const itemToUpdate = updatedList[index];
    const incomingMessageId = getMessageId(data);
    const incomingCallHistoryId = isCallLog ? getCallHistoryId(data) : null;
    const lastMessageId = itemToUpdate.lastMessage?.messageId || null;
    const lastCallHistoryId = itemToUpdate.lastMessage?.callHistoryId || null;
    const isSameSidebarEvent =
        (incomingMessageId && lastMessageId === incomingMessageId) ||
        (incomingCallHistoryId && lastCallHistoryId === incomingCallHistoryId);

    updatedList.splice(index, 1);
    updatedList.unshift({
        ...itemToUpdate,
        lastMessage: {
            content: previewContent,
            senderId,
            createdAt: data.createdAt || createdAtFallback,
            isRead: !isUnread,
            messageId: incomingMessageId,
            callHistoryId: incomingCallHistoryId,
        },
        hasUnread: isUnread,
        unreadCount: isUnread
            ? isSameSidebarEvent
                ? (itemToUpdate.unreadCount || 0)
                : (itemToUpdate.unreadCount || 0) + 1
            : 0,
    });

    return updatedList;
};

export const checkIfConversationMuted = (data, { users = [], groups = [], receiverId, targetId }) => {
    if (data?.isGroup) {
        const group = groups.find(g => String(g._id) === String(receiverId));
        return group ? !!(group.isMuted || (group.mutedUntil && new Date(group.mutedUntil) > new Date())) : false;
    } else {
        const user = users.find(u => String(u._id) === String(targetId));
        return user ? !!(user.isMuted || (user.mutedUntil && new Date(user.mutedUntil) > new Date())) : false;
    }
};
