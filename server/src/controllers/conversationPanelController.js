const { getConversationMigrationConfig, validateServerEnv } = require("../config/env");
const { sendError } = require("../utils/apiResponse");
const permissionService = require("../services/permissionService");
const overviewService = require("../services/overviewService");
const preferenceService = require("../services/preferenceService");
const crypto = require("crypto");

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
    if (scopesQuery) {
      const requestedScopes = scopesQuery.split(",").map(s => s.trim());
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

    // Mock response khi resources enabled
    return res.status(200).json({
      version: 1,
      resourcesPreview: {
        media: {
          status: "success",
          items: [],
          hasMore: false,
          nextCursor: null
        },
        files: {
          status: "success",
          items: [],
          hasMore: false,
          nextCursor: null
        },
        links: {
          status: "success",
          items: [],
          hasMore: false,
          nextCursor: null
        }
      },
      membership: {
        status: "success",
        commonGroups: [],
        membersPreview: [],
        hasMoreMembers: false,
        nextMemberCursor: null
      }
    });
  } catch (err) {
    console.error("Lỗi getResources skeleton:", err);
    return sendError(res, {
      status: 500,
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

