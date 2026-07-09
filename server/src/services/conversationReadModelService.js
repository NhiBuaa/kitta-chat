const mongoose = require("mongoose");
const { getConversationMigrationConfig } = require("../config/env");
const Conversation = require("../models/Conversation");
const ConversationParticipant = require("../models/ConversationParticipant");
const Group = require("../models/Group");

const toIdString = (value) => value?._id?.toString?.() || value?.toString?.() || String(value);

const uniqueIds = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    if (!value) return false;
    const id = toIdString(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const isSameId = (left, right) => toIdString(left) === toIdString(right);

const isGroupMessage = (message) => {
  if (message.isGroup === true || message.isGroup === "true") return true;
  if (!message.receiver) return false;
  return toIdString(message.receiver) === message.conversationId;
};

const isParticipantVisibleForMessage = (participant, messageAt) => {
  if (participant.leftAt && new Date(participant.leftAt) < messageAt) return false;
  if (participant.state?.deletedAt && new Date(participant.state.deletedAt) < messageAt) {
    return false;
  }
  return true;
};

const hasParticipantSeenMessageUpdate = (participant, messageId) => {
  return participant.state?.lastMessageId && isSameId(participant.state.lastMessageId, messageId);
};

async function getConversationShape(message) {
  const legacyConversationId = message.conversationId;
  const senderId = message.sender?._id || message.sender;
  const receiverId = message.receiver?._id || message.receiver;
  const groupMessage = isGroupMessage(message);

  if (!groupMessage) {
    const participantUserIds = uniqueIds([senderId, receiverId]);
    return {
      kind: "direct",
      legacyConversationId,
      directKey: legacyConversationId,

      participantUserIds,
      rolesByUserId: new Map(participantUserIds.map((userId) => [toIdString(userId), "member"])),
    };
  }

  const group = await Group.findById(legacyConversationId);
  if (!group) return null;

  const participantUserIds = uniqueIds(group.members || []).map((id) => new mongoose.Types.ObjectId(toIdString(id)));
  const adminId = group.admin ? toIdString(group.admin) : null;
  return {
    kind: "group",
    legacyConversationId,
    groupId: group._id,
    participantUserIds,
    rolesByUserId: new Map(
      participantUserIds.map((userId) => [
        toIdString(userId),
        adminId && toIdString(userId) === adminId ? "admin" : "member",
      ]),
    ),
  };
}

async function ensureParticipant({ conversation, shape, userId, message, messageAt }) {
  const messageId = message._id;
  const isSender = isSameId(userId, message.sender?._id || message.sender);
  const isReadByMe = Array.isArray(message.readBy) && message.readBy.some((id) => isSameId(id, userId));
  const hasAlreadyRead = isSender || isReadByMe || (message.isRead === true && !isSender);
  const role = shape.rolesByUserId.get(toIdString(userId)) || null;

  const existingParticipant = await ConversationParticipant.findOne({
    conversationId: conversation._id,
    userId,
  });

  if (!existingParticipant) {
    await ConversationParticipant.create({
      conversationId: conversation._id,
      legacyConversationId: shape.legacyConversationId,
      userId,
      role,
      joinedAt: messageAt,
      state: {
        unreadCount: hasAlreadyRead ? 0 : 1,
        lastMessageId: messageId,
        lastMessageAt: messageAt,
      },
    });
    return;
  }

  if (!isParticipantVisibleForMessage(existingParticipant, messageAt)) return;
  if (hasParticipantSeenMessageUpdate(existingParticipant, messageId)) return;

  const update = {
    $set: {
      "state.lastMessageId": messageId,
      "state.lastMessageAt": messageAt,
    },
  };

  if (!hasAlreadyRead) {
    update.$inc = { "state.unreadCount": 1 };
  }

  await ConversationParticipant.updateOne(
    {
      conversationId: conversation._id,
      userId,
    },
    update,
  );
}

async function ensureConversationForConfirmedMessage(message) {
  if (!message || message.isDuplicate) return null;
  if (!message._id || !message.conversationId || !message.sender) return null;

  const shape = await getConversationShape(message);
  if (!shape) return null;

  const messageAt = new Date(message.createdAt || Date.now());

  const conversation = await Conversation.findOneAndUpdate(
    { legacyConversationId: shape.legacyConversationId },
    {
      $setOnInsert: {
        kind: shape.kind,
        legacyConversationId: shape.legacyConversationId,
        ...(shape.directKey ? { directKey: shape.directKey } : {}),
        ...(shape.groupId ? { groupId: shape.groupId } : {}),
        participantUserIds: shape.participantUserIds,
      },
      $set: {
        lastMessageId: message._id,
        lastMessageAt: messageAt,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  );

  for (const userId of shape.participantUserIds) {
    await ensureParticipant({ conversation, shape, userId, message, messageAt });
  }

  return conversation;
}

async function markConversationAsRead({ userId, legacyConversationId, lastReadMessageId, lastReadAt = new Date() } = {}) {
  if (!userId || !legacyConversationId) return null;

  try {
    const update = {
      $set: {
        "state.unreadCount": 0,
        ...(lastReadMessageId ? { "state.lastReadMessageId": lastReadMessageId } : {}),
        "state.lastReadAt": lastReadAt,
      },
    };

    return await ConversationParticipant.updateOne(
      { legacyConversationId, userId },
      update,
    );
  } catch (error) {
    console.error(`[ReadModel] markConversationAsRead failed for user=${userId} conv=${legacyConversationId}:`, error);
    return null;
  }
}


async function syncGroupLifecycle(groupId, action, data = {}) {
  const { conversationDualWriteEnabled } = getConversationMigrationConfig();
  if (!conversationDualWriteEnabled) return;

  try {
    const legacyConversationId = toIdString(groupId);

    if (action === "delete") {
      const conv = await Conversation.findOne({ legacyConversationId });
      if (conv) {
        await ConversationParticipant.deleteMany({ conversationId: conv._id });
        await Conversation.deleteOne({ _id: conv._id });
      }
      return;
    }

    const group = await Group.findById(legacyConversationId);
    if (!group) return;

    let conversation = await Conversation.findOne({ legacyConversationId });
    const participantUserIds = uniqueIds(group.members || []).map((id) => new mongoose.Types.ObjectId(toIdString(id)));

    if (!conversation) {
      conversation = await Conversation.create({
        kind: "group",
        legacyConversationId,
        groupId: group._id,
        participantUserIds,
        lastMessageId: undefined,
        lastMessageAt: null,
      });
    } else {
      await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { participantUserIds } }
      );
    }

    const adminId = group.admin ? toIdString(group.admin) : null;
    const now = new Date();

    for (const userId of participantUserIds) {
      const userIdStr = toIdString(userId);
      const role = adminId && userIdStr === adminId ? "admin" : "member";

      const existingParticipant = await ConversationParticipant.findOne({
        conversationId: conversation._id,
        userId,
      });

      if (!existingParticipant) {
        await ConversationParticipant.create({
          conversationId: conversation._id,
          legacyConversationId,
          userId,
          role,
          joinedAt: now,
          leftAt: null,
          state: {
            unreadCount: 0,
            lastMessageId: null,
            lastMessageAt: null,
          },
        });
      } else {
        const update = {
          $set: { role, leftAt: null },
        };
        if (existingParticipant.leftAt !== null) {
          update.$set.joinedAt = now;
        }
        await ConversationParticipant.updateOne(
          { conversationId: conversation._id, userId },
          update
        );
      }
    }

    await ConversationParticipant.updateMany(
      {
        conversationId: conversation._id,
        userId: { $nin: participantUserIds },
        leftAt: null,
      },
      {
        $set: {
          leftAt: now,
          role: null,
        },
      }
    );
  } catch (error) {
    console.error(`[ReadModel] syncGroupLifecycle failed for action=${action} groupId=${groupId}:`, error);
  }
}

module.exports = {
  ensureConversationForConfirmedMessage,
  markConversationAsRead,
  syncGroupLifecycle,
};

