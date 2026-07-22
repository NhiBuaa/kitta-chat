const { getConversationMigrationConfig, validateServerEnv } = require("../config/env");
const { sendError } = require("../utils/apiResponse");
const permissionService = require("../services/permissionService");
const overviewService = require("../services/overviewService");
const preferenceService = require("../services/preferenceService");
const crypto = require("crypto");

const Group = require("../models/Group");
const User = require("../models/User");
const ConversationParticipant = require("../models/ConversationParticipant");
const { syncGroupLifecycle } = require("../services/conversationReadModelService");
const { applySoftDeleteState } = require("../services/conversationVisibilityHelpers");
const getSafeUserName = require("../utils/getSafeUserName");
const { createSystemMessage } = require("./messageController");

// Helper lấy config realtime tránh cache khi boot
const getPanelConfig = () => {
  try {
    return validateServerEnv(process.env);
  } catch (err) {
    // Fallback trong trường hợp test envValidation test validation độc lập
    return {
      conversationPanelEnabled: process.env.CONVERSATION_PANEL_ENABLED === "true",
      conversationPanelResourcesEnabled: process.env.CONVERSATION_PANEL_RESOURCES_ENABLED === "true",
      conversationPanelRateLimit: parseInt(process.env.CONVERSATION_PANEL_RATE_LIMIT, 10) || 30,
    };
  }
};

/**
 * GET /api/conversations/:id/panel/metadata
 * Giai đoạn 1: Lấy nhanh Overview, Preference và Permissions
 */
exports.getMetadata = async (req, res) => {
  try {
    const config = getPanelConfig();
    if (!config.conversationPanelEnabled) {
      return sendError(res, {
        status: 404,
        code: "PANEL_DISABLED",
        message: "Conversation panel is disabled",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const conversationId = req.params.id;

    // Set API Version header
    res.setHeader("X-Panel-Version", "1");

    // Đánh giá quyền truy cập
    const permissions = await permissionService.getPermissions(userId, conversationId);
    if (!permissions.canRead) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền truy cập cuộc hội thoại này",
      });
    }

    // Lấy dữ liệu Overview và Preference thực tế
    const overview = await overviewService.getOverview(userId, conversationId);
    const preference = await preferenceService.getPreferences(userId, conversationId);

    // Tính toán ETag dựa trên thông tin tĩnh và preference, loại trừ isOnline của Presence
    const etagInput = `${conversationId}-${overview.kind}-${overview.name}-${overview.avatar}-${overview.memberCount}-${preference.isPinned}-${preference.isMuted}-${preference.mutedUntil ? new Date(preference.mutedUntil).getTime() : ""}-${preference.customTitle || ""}`;
    const hash = crypto.createHash("sha1").update(etagInput).digest("base64");
    const etag = `W/"${hash}"`;

    res.setHeader("ETag", etag);

    // Kiểm tra ETag cache
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    return res.status(200).json({
      version: 1,
      overview,
      preference,
      permissions
    });
  } catch (err) {
    console.error("Lỗi getMetadata:", err);
    
    // Nếu là lỗi không tìm thấy cuộc hội thoại
    if (err.status === 404) {
      return sendError(res, {
        status: 404,
        code: err.code || "NOT_FOUND",
        message: err.message,
      });
    }

    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/**
 * PATCH /api/conversations/:id/panel/preference
 * Cập nhật tùy chỉnh cá nhân (ghim, tắt thông báo, custom title)
 */
exports.updatePreference = async (req, res) => {
  try {
    const config = getPanelConfig();
    if (!config.conversationPanelEnabled) {
      return sendError(res, {
        status: 404,
        code: "PANEL_DISABLED",
        message: "Conversation panel is disabled",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const conversationId = req.params.id;
    const updates = req.body;

    res.setHeader("X-Panel-Version", "1");

    // Đánh giá quyền truy cập
    const permissions = await permissionService.getPermissions(userId, conversationId);
    if (!permissions.canRead) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền truy cập cuộc hội thoại này",
      });
    }

    // Kiểm tra quyền sửa đổi cấu hình tương ứng
    if (updates.isPinned !== undefined && !permissions.canPin) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền ghim cuộc hội thoại này",
      });
    }

    if ((updates.isMuted !== undefined || updates.mutedUntil !== undefined) && !permissions.canMute) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền tắt thông báo cuộc hội thoại này",
      });
    }

    const newPreferences = await preferenceService.updatePreferences(userId, conversationId, updates);

    return res.status(200).json({
      version: 1,
      preference: newPreferences,
    });
  } catch (err) {
    console.error("Lỗi updatePreference:", err);
    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/**
 * GET /api/conversations/:id/panel/resources
 * Giai đoạn 2: Tải bất đồng bộ các tài nguyên
 */
exports.getResources = async (req, res) => {
  try {
    const config = getPanelConfig();
    if (!config.conversationPanelEnabled) {
      return sendError(res, {
        status: 404,
        code: "PANEL_DISABLED",
        message: "Conversation panel is disabled",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const conversationId = req.params.id;

    res.setHeader("X-Panel-Version", "1");

    // Đánh giá quyền truy cập
    const permissions = await permissionService.getPermissions(userId, conversationId);
    if (!permissions.canRead) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền truy cập cuộc hội thoại này",
      });
    }

    const scopesQuery = req.query.scopes;
    let requestedScopes = ["media", "files", "links", "membership"];
    if (scopesQuery) {
      requestedScopes = scopesQuery.split(",").map(s => s.trim());
      const validScopes = ["media", "files", "links", "membership"];
      for (const scope of requestedScopes) {
        if (!validScopes.includes(scope)) {
          return sendError(res, {
            status: 400,
            code: "INVALID_RETRY_SCOPE",
            message: `Scope '${scope}' không hợp lệ. Các scope hợp lệ: ${validScopes.join(", ")}`,
          });
        }
      }
    }

    // Nếu tắt resources flag, trả về cấu trúc rỗng
    if (!config.conversationPanelResourcesEnabled) {
      return res.status(200).json({
        version: 1,
        resourcesPreview: {
          media: { status: "success", items: [], hasMore: false, nextCursor: null },
          files: { status: "success", items: [], hasMore: false, nextCursor: null },
          links: { status: "success", items: [], hasMore: false, nextCursor: null }
        },
        membership: {
          status: "success",
          commonGroups: [],
          membersPreview: [],
          hasMoreMembers: false,
          nextMemberCursor: null
        }
      });
    }

    const resourceService = require("../services/resourceService");

    const cursor = req.query.cursor || null;

    // Helper timeout loader 2s
    const runLoaderWithTimeout = async (loaderPromise, timeoutMs = 2000, fallback) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Timeout"));
        }, timeoutMs);
      });

      try {
        const result = await Promise.race([loaderPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        return { status: "success", ...result };
      } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Loader error/timeout:`, error);
        return {
          status: "error",
          ...fallback
        };
      }
    };

    const promises = {};

    if (requestedScopes.includes("media")) {
      promises.media = runLoaderWithTimeout(
        resourceService.loadMedia(conversationId, 6, cursor, userId),
        2000,
        { items: [], hasMore: false, nextCursor: null }
      );
    }

    if (requestedScopes.includes("files")) {
      promises.files = runLoaderWithTimeout(
        resourceService.loadFiles(conversationId, 3, cursor, userId),
        2000,
        { items: [], hasMore: false, nextCursor: null }
      );
    }

    if (requestedScopes.includes("links")) {
      promises.links = runLoaderWithTimeout(
        resourceService.loadLinks(conversationId, 3, cursor, userId),
        2000,
        { items: [], hasMore: false, nextCursor: null }
      );
    }

    if (requestedScopes.includes("membership")) {
      const isDirect = conversationId.includes("_");
      const membershipLimit = isDirect ? 3 : 5;
      promises.membership = runLoaderWithTimeout(
        resourceService.loadMembership(conversationId, membershipLimit, cursor, userId),
        2000,
        {
          commonGroups: [],
          membersPreview: [],
          hasMoreMembers: false,
          nextMemberCursor: null
        }
      );
    }


    // Chạy song song các loaders
    const results = {};
    const activeKeys = Object.keys(promises);
    const settledResults = await Promise.all(activeKeys.map(k => promises[k]));
    activeKeys.forEach((key, idx) => {
      results[key] = settledResults[idx];
    });

    // Build response
    const responsePayload = {
      version: 1,
    };

    const resourcesPreview = {};

    if (results.media) {
      resourcesPreview.media = results.media;
    } else if (!scopesQuery) {
      resourcesPreview.media = { status: "success", items: [], hasMore: false, nextCursor: null };
    }

    if (results.files) {
      resourcesPreview.files = results.files;
    } else if (!scopesQuery) {
      resourcesPreview.files = { status: "success", items: [], hasMore: false, nextCursor: null };
    }

    if (results.links) {
      resourcesPreview.links = results.links;
    } else if (!scopesQuery) {
      resourcesPreview.links = { status: "success", items: [], hasMore: false, nextCursor: null };
    }

    if (Object.keys(resourcesPreview).length > 0 || !scopesQuery) {
      responsePayload.resourcesPreview = resourcesPreview;
    }

    if (results.membership) {
      responsePayload.membership = results.membership;
    } else if (!scopesQuery) {
      responsePayload.membership = {
        status: "success",
        commonGroups: [],
        membersPreview: [],
        hasMoreMembers: false,
        nextMemberCursor: null
      };
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error("Lỗi getResources:", err);
    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

const GROUP_USER_FIELDS = "displayName avatar username status activityStatus";

const buildGroupSystemMessagePayload = (groupId, systemMessage) => ({
  _id: systemMessage._id,
  conversationId: groupId,
  senderId: null,
  sender: null,
  receiverId: groupId,
  receiver: groupId,
  text: systemMessage.text,
  type: "system",
  createdAt: systemMessage.createdAt,
  isGroup: true,
});

/**
 * POST /api/conversations/:id/panel/leave
 * Rời khỏi nhóm trò chuyện (Slice 6)
 */
exports.leaveGroup = async (req, res) => {
  try {
    const config = getPanelConfig();
    if (!config.conversationPanelEnabled) {
      return sendError(res, {
        status: 404,
        code: "PANEL_DISABLED",
        message: "Conversation panel is disabled",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const groupId = req.params.id;
    const io = req.app.get("socketio");

    // Đánh giá quyền truy cập bằng Permission DTO
    const permissions = await permissionService.getPermissions(userId, groupId);
    if (!permissions.canLeave) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền rời khỏi cuộc trò chuyện này",
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return sendError(res, {
        status: 404,
        code: "NOT_FOUND",
        message: "Nhóm không tồn tại",
      });
    }

    // Ràng buộc: Trưởng nhóm không thể rời khi nhóm còn thành viên khác
    if (group.admin && group.admin.toString() === userId.toString() && group.members.length > 1) {
      return sendError(res, {
        status: 400,
        code: "ADMIN_TRANSFER_REQUIRED",
        message: "Vui lòng chuyển quyền trưởng nhóm trước khi rời nhóm",
      });
    }

    const previousMemberIds = group.members.map((id) => id.toString());

    // Cập nhật members
    group.members = group.members.filter((id) => id.toString() !== userId.toString());
    await group.save();

    // Đồng bộ hóa với Conversation Read Model
    await syncGroupLifecycle(groupId, "remove-member", { memberId: userId });

    // Tạo tin nhắn hệ thống
    const user = await User.findById(userId).select("displayName username");
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(user)} đã rời nhóm`
    );

    if (io) {
      // Gửi tin nhắn hệ thống đến room nhóm
      io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

      // Lấy thông tin nhóm cập nhật để gửi event groupMemberUpdated
      const updatedGroup = await Group.findById(groupId)
        .populate("members", GROUP_USER_FIELDS)
        .populate("admin", GROUP_USER_FIELDS);

      const payload = {
        groupId,
        updatedGroup,
        removedMemberId: userId.toString(),
        isVoluntaryLeave: true,
      };

      // Emit tới tất cả thành viên trước đó để cập nhật danh sách
      Array.from(new Set(previousMemberIds)).forEach((mId) => {
        io.to(mId).emit("groupMemberUpdated", payload);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rời nhóm thành công",
    });
  } catch (err) {
    console.error("Lỗi leaveGroup:", err);
    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/**
 * POST /api/conversations/:id/panel/delete
 * Xóa lịch sử trò chuyện (soft delete) cho user hiện tại (Slice 6)
 */
exports.deleteHistory = async (req, res) => {
  try {
    const config = getPanelConfig();
    if (!config.conversationPanelEnabled) {
      return sendError(res, {
        status: 404,
        code: "PANEL_DISABLED",
        message: "Conversation panel is disabled",
      });
    }

    const userId = req.user?.id || req.user?._id;
    const conversationId = req.params.id;

    // Đánh giá quyền truy cập
    const permissions = await permissionService.getPermissions(userId, conversationId);
    if (!permissions.canDelete) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Bạn không có quyền xóa lịch sử cuộc trò chuyện này",
      });
    }

    // Tìm ConversationParticipant để cập nhật
    const participant = await ConversationParticipant.findOne({
      legacyConversationId: conversationId,
      userId: userId,
    });

    if (!participant) {
      return sendError(res, {
        status: 404,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Không tìm thấy thông tin thành viên hội thoại của bạn",
      });
    }

    const now = new Date();
    const update = applySoftDeleteState(participant, now);
    await ConversationParticipant.updateOne({ _id: participant._id }, update);

    return res.status(200).json({
      success: true,
      message: "Xóa lịch sử trò chuyện thành công",
    });
  } catch (err) {
    console.error("Lỗi deleteHistory:", err);
    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

