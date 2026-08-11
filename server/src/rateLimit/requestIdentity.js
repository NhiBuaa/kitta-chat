const ipaddr = require("ipaddr.js");
const { resolveCanonicalDirectConversationResource } = require("../validation/directConversationResource");
const { isValidExternalObjectId } = require("../validation/externalObjectId");

const canonicalNetworkActor = (req) => {
  const rawAddress = req?.ip;
  if (typeof rawAddress !== "string" || !rawAddress) return null;

  try {
    return {
      kind: "network",
      value: ipaddr.process(rawAddress).toString(),
    };
  } catch {
    return null;
  }
};

const canonicalUserActor = (req) => {
  const value = req?.user?.id || req?.user?._id;
  if (!value) return null;
  return { kind: "user", value: String(value) };
};

const canonicalRefreshSubjectActor = (subject) => {
  if (!subject) return null;
  return { kind: "subject", value: String(subject) };
};

const canonicalSocketActor = (userId) => {
  if (!userId) return null;
  return { kind: "socket_user", value: String(userId) };
};

const canonicalConversationId = (req) => {
  const conversationId = req?.params?.id;
  const userId = req?.user?.id || req?.user?._id;
  if (typeof conversationId !== "string" || !conversationId || !userId) return null;

  if (conversationId.includes("_")) {
    return resolveCanonicalDirectConversationResource(conversationId, userId)?.conversationId || null;
  }

  if (isValidExternalObjectId(conversationId)) return conversationId.toLowerCase();

  // Group/legacy panel identifiers are validated by the panel authorization
  // boundary. The limiter must still have a stable actor+conversation key for
  // that legacy contract; only direct-pair identifiers are canonicalized here
  // because they carry requester-sensitive semantics.
  if (!/^[^\s\u0000-\u001f]+$/.test(conversationId)) return null;
  return conversationId;
};

module.exports = {
  canonicalConversationId,
  canonicalNetworkActor,
  canonicalRefreshSubjectActor,
  canonicalSocketActor,
  canonicalUserActor,
};
