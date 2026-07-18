import { useEffect, useState } from "react";

export const belongsToConversation = (message, conversationId, currentUserId) => {
  if (!message) return false;

  // Direct check by conversationId property if present
  if (message.conversationId && String(message.conversationId) === String(conversationId)) {
    return true;
  }

  // Fallback check by sender / receiver
  const senderId = message.senderId || (typeof message.sender === "object" ? message.sender?._id : message.sender);
  const receiverId = message.receiverId || (typeof message.receiver === "object" ? message.receiver?._id : message.receiver);

  if (message.isGroup) {
    return String(receiverId) === String(conversationId);
  } else {
    if (!senderId || !receiverId) return false;
    const computedId = [String(senderId), String(receiverId)].sort().join("_");
    return computedId === String(conversationId);
  }
};

const resolveAttachments = (message) => {
  if (Array.isArray(message?.attachmentsData)) return message.attachmentsData;
  if (Array.isArray(message?.attachments)) return message.attachments;
  return [];
};

export const matchesMedia = (message) => {
  if (!message) return false;
  if (message.image) return true;

  const attachments = resolveAttachments(message);
  return attachments.some(
    (file) => file?.mimeType?.startsWith("image/") || file?.mimeType?.startsWith("video/")
  );
};

export const matchesFile = (message) => {
  if (!message) return false;
  const attachments = resolveAttachments(message);
  // Matches if there are attachments and none of them are media
  return attachments.length > 0 && !matchesMedia(message);
};

export const matchesLink = (message) => {
  if (!message || !message.text) return false;
  const text = message.text;
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
  return urlRegex.test(text);
};

export const useExplorerFreshness = ({
  conversationId,
  type,
  socket,
  currentUserId,
}) => {
  const [hasNewItems, setHasNewItems] = useState(false);

  useEffect(() => {
    if (!socket || !conversationId || type === "commonGroups") {
      return;
    }

    const handleNewMessage = (message) => {
      if (!belongsToConversation(message, conversationId, currentUserId)) {
        return;
      }

      let matches = false;
      if (type === "media") {
        matches = matchesMedia(message);
      } else if (type === "files") {
        matches = matchesFile(message);
      } else if (type === "links") {
        matches = matchesLink(message);
      }

      if (matches) {
        setHasNewItems(true);
      }
    };

    socket.on("getMessage", handleNewMessage);

    return () => {
      socket.off("getMessage", handleNewMessage);
    };
  }, [conversationId, type, socket, currentUserId]);

  const refresh = (onRefresh) => {
    setHasNewItems(false);
    if (typeof onRefresh === "function") {
      onRefresh();
    }
  };

  return {
    hasNewItems,
    refresh,
  };
};
