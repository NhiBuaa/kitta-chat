const Message = require('../models/Message');

// [POST] /api/messages
exports.createMessage = async (req, res) => {
    try {
        const { sender, receiver, text, image, isGroup, type = 'text' } = req.body;

        let conversationId;
        if (isGroup) {
            conversationId = receiver;
        } else {
            conversationId = [sender, receiver].sort().join("_");
        }

        // Tạo Message mới
        const newMessage = new Message({
            conversationId,
            type,
            sender,
            receiver,
            text,
            image
        });

        // 3. Lưu và trả về
        const savedMessage = await newMessage.save();
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
        if (req.query.isGroup === 'true') {
            conversationId = userId2;
        } else {
            conversationId = [userId1, userId2].sort().join("_");
        }

        const messages = await Message.find({
            conversationId: conversationId
        }).populate('sender', 'displayName avatar email');

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
            type: 'system',
            sender: null,
            receiver: null,
            text: text
        });
        await systemMessage.save();
        return systemMessage;
    } catch (error) {
        console.error("Lỗi tạo system message:", error);
        return null;
    }
};