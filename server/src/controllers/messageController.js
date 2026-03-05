const Message = require("../models/Message");

// [POST] /api/messages
exports.createMessage = async (req, res) => {
  try {
    // Lấy type từ frontend gửi lên
    const { sender, receiver, text, image, files, isGroup, type } = req.body;
    console.log("📥 Dữ liệu nhận từ FE:", req.body);

    let conversationId;
    const isGroupChat = isGroup === true || isGroup === "true";

    if (isGroupChat) {
      conversationId = receiver;
    } else {
      if (!sender || !receiver) {
        return res
          .status(400)
          .json({ message: "Thiếu thông tin người gửi/nhận" });
      }
      conversationId = [sender, receiver].sort().join("_");
    }

    // NẾU LÀ SYSTEM MESSAGE
    if (type === "system") {
      const savedSystemMsg = await exports.createSystemMessage(
        conversationId,
        text,
      );

      if (savedSystemMsg) {
        return res.status(200).json(savedSystemMsg);
      } else {
        return res.status(500).json({ message: "Lỗi tạo tin nhắn hệ thống" });
      }
    }

    // NẾU LÀ TIN NHẮN THƯỜNG -> XỬ LÝ NHƯ CŨ
    const newMessage = new Message({
      conversationId,
      type: "text",
      sender,
      receiver,
      text,
      image,
      files,
    });

    const savedMessage = await newMessage.save();
    console.log("✅ Đã lưu thành công:", savedMessage);
    res.status(200).json(savedMessage);
  } catch (err) {
    console.error("Create Message Error:", err);
    res.status(500).json(err);
  }
};

// [GET] /api/messages/:userId1/:userId2
exports.getMessages = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    let conversationId;
    if (req.query.isGroup === "true") {
      conversationId = userId2;
    } else {
      conversationId = [userId1, userId2].sort().join("_");
    }

    const messages = await Message.find({
      conversationId: conversationId,
    }).populate("sender", "displayName avatar email");

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json(err);
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Chưa chọn file" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ message: "Lỗi upload" });
  }
};

// Helper function: Tạo system message
exports.createSystemMessage = async (groupId, text) => {
  try {
    const systemMessage = new Message({
      conversationId: groupId,
      type: "system",
      sender: null,
      receiver: null,
      text: text,
    });
    await systemMessage.save();
    return systemMessage;
  } catch (error) {
    console.error("Lỗi tạo system message:", error);
    return null;
  }
};

exports.uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const fileUrls = req.files.map((file) => `/uploads/${file.filename}`);

    res.status(200).json({
      success: true,
      files: fileUrls,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
