const Message = require('../models/Message');

// [POST] /api/messages
exports.createMessage = async (req, res) => {
    try {
        // conversationId ở đây mình sẽ dùng mẹo: gộp ID 2 người lại để làm mã cuộc trò chuyện
        // Ví dụ: UserA_UserB (sắp xếp theo alphabet để A chat với B giống B chat với A)
        const { sender, receiver, text } = req.body;

        // Tạo conversationId duy nhất cho 2 người này
        const conversationId = [sender, receiver].sort().join("_");

        const newMessage = new Message({
            conversationId,
            sender,
            text
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
        const conversationId = [userId1, userId2].sort().join("_");

        const messages = await Message.find({
            conversationId: conversationId
        });

        res.status(200).json(messages);
    } catch (err) {
        res.status(500).json(err);
    }
};