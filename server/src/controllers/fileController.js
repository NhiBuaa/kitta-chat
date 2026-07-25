const s3Service = require("../services/s3.service");
const FileModel = require("../models/File");
const MessageModel = require("../models/Message");
const ConversationParticipant = require("../models/ConversationParticipant");
const permissionService = require("../services/permissionService");
const {
  buildMessageVisibilityFilter,
} = require("../services/conversationVisibilityHelpers");
const { buildChatImageJob } = require("../queues/imageJobs");
const { imageQueue: defaultImageQueue } = require("../queues/imageQueue");
const { buildQueueFailureResponse } = require("../utils/queueApiSemantics");

const getLocalDemoDownloadUrl = (file) => {
  if (
    typeof file?.s3Key === "string" &&
    file.s3Key.startsWith("demo-local/") &&
    typeof file?.url === "string" &&
    file.url.startsWith("/demo-assets/")
  ) {
    return file.url;
  }
  return null;
};

const createFileController = ({
  imageQueue = defaultImageQueue,
  storage = s3Service,
  fileModel = FileModel,
  messageModel = MessageModel,
  participantModel = ConversationParticipant,
  permissionService: permissions = permissionService,
} = {}) => ({
  init: async (req, res) => {
    try {
      const { fileName, fileType } = req.body;
      const { uploadId, key } = await storage.initiateUpload(fileName, fileType);

      res.status(200).json({ uploadId, key });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  getPresignedUrl: async (req, res) => {
    try {
      const { uploadId, key, partNumber } = req.body;
      const url = await storage.getPartUrl(uploadId, key, partNumber);

      res.status(200).json({ url });
    } catch (error) {
      res.status(500).json({ message: "Lỗi tạo Presigned URL", error: error.message });
    }
  },

  complete: async (req, res) => {
    try {
      const { uploadId, key, parts, fileName, fileType, fileSize, fileHash } = req.body;

      await storage.completeUpload(uploadId, key, parts);

      const baseUrl =
        process.env.CLOUDFRONT_URL ||
        `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const fileUrl = `${baseUrl}/${key}`;

      const userId = req.user?._id || req.user?.id || req.userId;
      if (!userId) {
        throw new Error("Không lấy được ID người dùng từ token.");
      }

      const newFile = await FileModel.create({
        ownerId: userId,
        originalName: fileName,
        mimeType: fileType,
        size: fileSize,
        s3Key: key,
        url: fileUrl,
        fileHash,
      });

      res.status(200).json({ message: "Upload thành công", file: newFile });
    } catch (error) {
      console.error(" lỗi hoàn tất upload:", error);
      if (req.body.uploadId) {
        await s3Service
          .abortUpload(req.body.uploadId, req.body.key)
          .catch((e) => console.error(" lỗi hủy S3:", e));
      }
      res.status(500).json({ message: "Ghép file thất bại", error: error.message });
    }
  },


  createDownloadUrl: async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || req.userId;
      const { fileId } = req.params;
      const { messageId } = req.body;

      if (!userId || !fileId || !messageId) {
        return res.status(400).json({ message: "Thiếu thông tin tải tài liệu." });
      }

      const [file, message] = await Promise.all([
        fileModel.findById(fileId).lean(),
        messageModel
          .findOne({ _id: messageId, attachments: fileId })
          .select("conversationId")
          .lean(),
      ]);

      if (!file || !message) {
        return res.status(404).json({ message: "Không tìm thấy tài liệu." });
      }

      const access = await permissions.getPermissions(userId, message.conversationId);
      if (!access.canRead) {
        return res.status(403).json({ message: "Bạn không có quyền tải tài liệu này." });
      }

      const participant = await participantModel
        .findOne({
          legacyConversationId: message.conversationId,
          userId,
        })
        .lean();
      const visibilityFilter = participant
        ? buildMessageVisibilityFilter(participant)
        : {};

      if (Object.keys(visibilityFilter).length > 0) {
        const visibleMessage = await messageModel.exists({
          _id: messageId,
          attachments: fileId,
          conversationId: message.conversationId,
          ...visibilityFilter,
        });
        if (!visibleMessage) {
          return res.status(403).json({
            message: "Bạn không có quyền tải tài liệu này.",
          });
        }
      }

      const localDemoUrl = getLocalDemoDownloadUrl(file);
      const url = localDemoUrl || await storage.getDownloadUrl(
        file.s3Key,
        file.originalName,
        file.mimeType,
      );

      return res.status(200).json({ url, originalName: file.originalName });
    } catch (error) {
      return res.status(500).json({
        message: "Không thể tạo liên kết tải tài liệu.",
        error: error.message,
      });
    }
  },

  uploadSingleFile: async (req, res) => {
    let source = null;
    let job = null;
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Không tìm thấy file upload" });
      }

      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ message: "Endpoint này chỉ xử lý ảnh." });
      }

      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        throw new Error("Khong lay duoc id nguoi dung tu token");
      }

      source = await storage.uploadObject(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        "queue-sources",
      );

      job = buildChatImageJob({
        source,
        file: req.file,
        userId,
        correlationId: req.requestId,
      });
      await imageQueue.publishImageJob(job);

      res.status(202).json({
        success: true,
        queued: true,
        requestId: job.requestId,
        message: "Anh dang duoc xu ly.",
        file: {
          requestId: job.requestId,
          status: "processing",
          name: req.file.originalname,
          type: req.file.mimetype,
          size: req.file.size,
        },
      });
    } catch (err) {
      console.error("Loi uploadSingleFile:", err);
      if (source?.key && typeof storage.deleteObject === "function") {
        await storage.deleteObject(source.key).catch(() => {});
      }

      res.status(503).json(
        buildQueueFailureResponse({
          message: "Khong the dua anh vao hang doi xu ly",
          file: req.file
            ? {
                requestId: job?.requestId,
                name: req.file.originalname,
                type: req.file.mimetype,
                size: req.file.size,
              }
            : null,
        }),
      );
    }
  },
});

module.exports = createFileController();
module.exports.createFileController = createFileController;
module.exports.getLocalDemoDownloadUrl = getLocalDemoDownloadUrl;
