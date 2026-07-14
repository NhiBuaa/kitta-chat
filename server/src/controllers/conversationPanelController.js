const { getConversationMigrationConfig, validateServerEnv } = require("../config/env");
const { sendError } = require("../utils/apiResponse");
const permissionService = require("../services/permissionService");

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

    // ETag mock cho skeleton
    res.setHeader("ETag", '"mock-etag-v1"');

    return res.status(200).json({
      version: 1,
      overview: {
        kind: "direct",
        name: "Mock Conversation",
        avatar: "",
        isOnline: false,
        memberCount: 2
      },
      preference: {
        isPinned: false,
        isMuted: false,
        mutedUntil: null
      },
      permissions
    });
  } catch (err) {
    console.error("Lỗi getMetadata skeleton:", err);
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
