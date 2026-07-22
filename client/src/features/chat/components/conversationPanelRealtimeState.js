import { belongsToConversation, matchesLink, matchesMedia } from "../hooks/useExplorerFreshness.js";

const normalizeMemberId = (member) => {
  if (!member) return null;
  if (typeof member === "object") {
    return member._id ? String(member._id) : null;
  }
  return String(member);
};

export const shouldRefreshDirectCommonGroups = ({
  action,
  group,
  currentUserId,
  peerUserId,
  panelKind,
}) => {
  if (
    action !== "created" ||
    panelKind !== "direct" ||
    !currentUserId ||
    !peerUserId ||
    !Array.isArray(group?.members)
  ) {
    return false;
  }

  const memberIds = new Set(group.members.map(normalizeMemberId).filter(Boolean));
  return memberIds.has(String(currentUserId)) && memberIds.has(String(peerUserId));
};

const resolveMessageAttachments = (message) => {
  if (Array.isArray(message?.attachmentsData)) return message.attachmentsData;
  if (Array.isArray(message?.attachments)) return message.attachments;
  if (Array.isArray(message?.files)) return message.files;
  return [];
};

const isMediaAttachment = (attachment) => {
  const mimeType = attachment?.mimeType || attachment?.type || "";
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
};

export const getRealtimePanelResourceScopes = ({
  message,
  conversationId,
  currentUserId,
}) => {
  if (!belongsToConversation(message, conversationId, currentUserId)) {
    return [];
  }

  const attachments = resolveMessageAttachments(message);
  const hasMedia =
    matchesMedia(message) ||
    message?.type === "image" ||
    message?.type === "video";
  const hasFiles =
    attachments.some((attachment) => !isMediaAttachment(attachment)) ||
    Boolean(message?.file) ||
    (message?.type === "file" && !hasMedia);
  const scopes = [];

  if (hasMedia) scopes.push("media");
  if (hasFiles) scopes.push("files");
  if (matchesLink(message)) scopes.push("links");

  return scopes;
};
