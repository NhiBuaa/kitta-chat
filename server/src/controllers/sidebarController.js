const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const ConversationParticipant = require("../models/ConversationParticipant");
const User = require("../models/User");
const Group = require("../models/Group");
const Message = require("../models/Message");

const decodeCursor = (cursor) => {
  if (!cursor) return null;
  const parts = cursor.split("_");
  if (parts.length < 2) return null;
  const timeStr = parts[0];
  const idStr = parts.slice(1).join("_");
  return [new Date(timeStr), idStr];
};

const encodeCursor = (lastMessageAt, conversationId) => {
  if (!lastMessageAt) return "";
  const isoStr = lastMessageAt instanceof Date ? lastMessageAt.toISOString() : new Date(lastMessageAt).toISOString();
  return `${isoStr}_${conversationId.toString()}`;
};

const getSidebarConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { cursor, kind } = req.query;

    // 1. Lọc conversations theo kind nếu có
    let conversationIdFilter = null;
    if (kind === "direct" || kind === "group") {
      const convs = await Conversation.find({ kind }).select("_id");
      const convIds = convs.map(c => c._id);
      conversationIdFilter = { $in: convIds };
    }

    // 2. Query pinned conversations (chỉ ở trang đầu tiên cursor === null)
    let pinnedParticipants = [];
    if (!cursor) {
      const pinnedFilter = {
        userId: currentUserId,
        leftAt: null,
        "state.pinnedAt": { $ne: null }
      };
      if (conversationIdFilter) {
        pinnedFilter.conversationId = conversationIdFilter;
      }
      pinnedParticipants = await ConversationParticipant.find(pinnedFilter)
        .populate("conversationId")
        .sort({ "state.lastMessageAt": -1, conversationId: -1 });
    }

    // 3. Query non-pinned conversations hỗ trợ Cursor-based Pagination
    const nonPinnedFilter = {
      userId: currentUserId,
      leftAt: null,
      "state.pinnedAt": null
    };
    if (conversationIdFilter) {
      nonPinnedFilter.conversationId = conversationIdFilter;
    }
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const [cursorTime, cursorId] = decoded;
        nonPinnedFilter.$or = [
          { "state.lastMessageAt": { $lt: cursorTime } },
          {
            "state.lastMessageAt": cursorTime,
            conversationId: { $lt: new mongoose.Types.ObjectId(cursorId) }
          }
        ];
      }
    }

    const limitPlusOne = limit + 1;
    const nonPinnedParticipants = await ConversationParticipant.find(nonPinnedFilter)
      .populate("conversationId")
      .sort({ "state.lastMessageAt": -1, conversationId: -1 })
      .limit(limitPlusOne);

    // 4. Xác định hasMore và nextCursor
    let hasMore = false;
    let nextCursor = null;
    let conversationsToReturn = [...nonPinnedParticipants];

    if (conversationsToReturn.length > limit) {
      hasMore = true;
      conversationsToReturn = conversationsToReturn.slice(0, limit);
      const lastItem = conversationsToReturn[conversationsToReturn.length - 1];
      nextCursor = encodeCursor(lastItem.state.lastMessageAt, lastItem.conversationId._id);
    }

    const allParticipants = [...pinnedParticipants, ...conversationsToReturn];

    // 5. Gom IDs để thực hiện batch query
    const targetUserIds = new Set();
    const targetGroupIds = new Set();
    const lastMessageIds = [];

    for (const p of allParticipants) {
      const conv = p.conversationId;
      if (!conv) continue;

      if (conv.kind === "direct") {
        const legacyId = conv.legacyConversationId || p.legacyConversationId;
        if (legacyId && legacyId.includes("_")) {
          const parts = legacyId.split("_");
          const targetId = parts.find(id => id !== String(currentUserId));
          if (targetId) {
            targetUserIds.add(targetId);
          }
        }
      } else if (conv.kind === "group") {
        const groupId = conv.groupId || p.legacyConversationId;
        if (groupId) {
          targetGroupIds.add(groupId.toString());
        }
      }

      if (p.state?.lastMessageId) {
        lastMessageIds.push(p.state.lastMessageId);
      }
    }

    // 6. Thực hiện batch query song song để tối ưu hóa hiệu năng
    const [users, groups, messages] = await Promise.all([
      targetUserIds.size > 0
        ? User.find({ _id: { $in: Array.from(targetUserIds) } }).select("displayName avatar status activityStatus")
        : [],
      targetGroupIds.size > 0
        ? Group.find({ _id: { $in: Array.from(targetGroupIds) } }).select("displayName avatar members admin")
        : [],
      lastMessageIds.length > 0
        ? Message.find({ _id: { $in: lastMessageIds } }).lean()
        : []
    ]);

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const groupMap = new Map(groups.map(g => [g._id.toString(), g]));
    const messageMap = new Map(messages.map(m => [m._id.toString(), m]));

    // Gom tiếp sender IDs từ messages để enrich sender
    const senderIds = new Set();
    for (const m of messages) {
      if (m.sender) {
        senderIds.add(m.sender.toString());
      }
    }

    const senders = senderIds.size > 0
      ? await User.find({ _id: { $in: Array.from(senderIds) } }).select("displayName avatar")
      : [];
    const senderMap = new Map(senders.map(s => [s._id.toString(), s]));

    // 7. Format và enrich payload response
    const now = new Date();
    const conversations = [];

    for (const p of allParticipants) {
      const conv = p.conversationId;
      if (!conv) continue;

      const kind = conv.kind;
      const isPinned = p.state?.pinnedAt !== null;
      const isMuted = !!(p.state?.mutedUntil && new Date(p.state.mutedUntil) > now);
      const unreadCount = p.state?.unreadCount || 0;
      const lastMessageAt = p.state?.lastMessageAt || null;

      let target = null;
      if (kind === "direct") {
        const legacyId = conv.legacyConversationId || p.legacyConversationId;
        const parts = legacyId.split("_");
        const targetId = parts.find(id => id !== String(currentUserId));
        if (targetId && userMap.has(targetId)) {
          const u = userMap.get(targetId);
          const isOnline = u.activityStatus?.state === "active" &&
            (now - new Date(u.activityStatus?.lastSeen)) < 5 * 60 * 1000;
          target = {
            _id: u._id,
            displayName: u.displayName,
            avatar: u.avatar,
            activityStatus: u.activityStatus,
            isOnline: !!isOnline
          };
        }
      } else if (kind === "group") {
        const groupId = (conv.groupId || p.legacyConversationId)?.toString();
        if (groupId && groupMap.has(groupId)) {
          const g = groupMap.get(groupId);
          target = {
            _id: g._id,
            displayName: g.displayName,
            avatar: g.avatar,
            memberCount: g.members?.length || 0
          };
        }
      }

      let lastMessage = null;
      if (p.state?.lastMessageId && messageMap.has(p.state.lastMessageId.toString())) {
        const m = messageMap.get(p.state.lastMessageId.toString());
        let senderName = "";
        let senderAvatar = "";

        if (m.sender) {
          const senderIdStr = m.sender.toString();
          if (senderIdStr === String(currentUserId)) {
            senderName = "Bạn";
          } else if (senderMap.has(senderIdStr)) {
            const s = senderMap.get(senderIdStr);
            senderName = s.displayName;
            senderAvatar = s.avatar;
          }
        }

        lastMessage = {
          senderId: m.sender || null,
          senderName,
          senderAvatar,
          content: m.text || "",
          createdAt: m.createdAt
        };
      }

      // Chỉ add vào response nếu enrich được target thành công
      if (target) {
        conversations.push({
          conversationId: conv._id,
          legacyConversationId: conv.legacyConversationId || p.legacyConversationId,
          kind,
          isPinned,
          isMuted,
          unreadCount,
          lastMessageAt,
          lastMessage,
          target
        });
      }
    }

    return res.status(200).json({
      success: true,
      conversations,
      nextCursor,
      hasMore
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSidebarConversations };
