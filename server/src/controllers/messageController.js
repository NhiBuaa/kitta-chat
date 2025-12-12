const Message = require('../models/Message');

// [POST] /api/messages
exports.createMessage = async (req, res) => {
    try {
        const { sender, receiver, text, image, isGroup } = req.body;
        // Tạo conversationId duy nhất cho 2 người này
        let conversationId;

        if (isGroup) {
            // Nếu là nhóm, conversationId chính là ID của nhóm (receiver)
            conversationId = receiver;
        } else {
            // Nếu là 1-1, gộp ID như cũ
            conversationId = [sender, receiver].sort().join("_");
        }

        const newMessage = new Message({
            conversationId,
            sender,
            text,
            image
        });

        const savedMessage = await newMessage.save();
        res.status(200).json(savedMessage);
    } catch (err) {
        res.status(500).json(err);
    }
};

// [GET] /api/messages/:userId1/:userId2
exports.getMessages = async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        let conversationId;
        if (req.query.isGroup === 'true') {
            conversationId = userId2;
        } else {
            conversationId = [userId1, userId2].sort().join("_");
        }

        const messages = await Message.find({
            conversationId: conversationId
        });

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