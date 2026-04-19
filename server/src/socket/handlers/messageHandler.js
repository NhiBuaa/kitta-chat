const User = require("../../models/User");
const Group = require("../../models/Group");
const Message = require("../../models/Message");
const getSafeUserName = require("../../utils/getSafeUserName");
const saveMessageInBackground = require("../../utils/saveMessageInBackground");
const buildConversationId = require("../../utils/buildConversationId");

/**
 * Đăng ký các message events cho một socket
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerMessageHandlers = (socket, io) => {
    // sendMessage 
    socket.on("sendMessage", async (messageData, callBack) => {
        try {
            const receiverId = messageData.receiverId || messageData.receiver;
            const sender = messageData.sender;
            const isGroup = messageData.isGroup;
            const senderId = typeof sender === "object" ? sender._id : sender;

            if (!receiverId) {
                console.error("[Message] Thiếu receiverId:", messageData);
                callBack?.({ success: false });
                return;
            }

            // Lấy senderInfo nếu chưa có
            let senderInfo = messageData.senderInfo;
            if (!senderInfo) {
                const senderDoc = await User.findById(senderId).select(
                    "displayName avatar username"
                );
                senderInfo = {
                    _id: senderId,
                    displayName: getSafeUserName(senderDoc),
                    avatar: senderDoc?.avatar,
                };
            }

            // Tính conversationId nếu chưa có
            const conversationId =
                messageData.conversationId ||
                (isGroup ? receiverId : buildConversationId(senderId, receiverId));

            // Lưu vào DB trước để payload realtime luôn có _id ổn định.
            const { doc: savedMessage, isDuplicate } = await saveMessageInBackground({
                ...messageData,
                sender: senderInfo,
                conversationId,
                receiverId,
            });

            const payloadToEmit = {
                ...messageData,
                sender: senderInfo,
                receiver: messageData.receiver || receiverId,
                _id: savedMessage?._id || messageData._id,
                createdAt: savedMessage?.createdAt || messageData.createdAt || new Date(),
                attachments: savedMessage?.attachments || messageData.attachments || [],
                // Gửi kèm idempotencyKey để client có thể dedupe khi nhận getMessage
                idempotencyKey: messageData.idempotencyKey || null,
            };

            if (isGroup) {
                // Lấy tên nhóm nếu chưa có trong payload
                if (!payloadToEmit.groupName) {
                    const groupDoc = await Group.findById(receiverId).select("name displayName");
                    payloadToEmit.groupName = groupDoc?.displayName || groupDoc?.name || "Nhóm chat";
                }

                // Emit đến tất cả thành viên trong room nhóm
                io.to(receiverId).emit("getMessage", payloadToEmit);
                console.log(`[Message] Group message → room ${receiverId}`);
            } else {
                // Emit cho cả 2 phía trong cuộc trò chuyện 1-1
                io.to(receiverId).emit("getMessage", payloadToEmit);
                io.to(senderId).emit("getMessage", payloadToEmit);
                console.log(`[Message] 1-1 message → ${senderId} & ${receiverId}`);
            }

            callBack?.({
                success: true,
                realId: savedMessage?._id,
                isDuplicate: Boolean(isDuplicate),
            });
        } catch (err) {
            console.error("[Message] sendMessage error:", err);
            callBack?.({ success: false });
        }
    });

    // markRead 
    socket.on("markRead", async (data) => {
        try {
            if (data?.isGroup) {
                const { groupId, readerId } = data;
                if (!groupId || !readerId) return;

                await Message.updateMany(
                    {
                        conversationId: groupId,
                        type: { $ne: "system" },
                        readBy: { $ne: readerId },
                    },
                    { $push: { readBy: readerId } }
                );

                io.to(groupId).emit("groupUserRead", { groupId, readerId });
            } else {
                const { senderId, receiverId } = data;
                if (!senderId || !receiverId) return;

                const convId = buildConversationId(senderId, receiverId);

                await Message.updateMany(
                    { sender: senderId, conversationId: convId, isRead: false },
                    { $set: { isRead: true } }
                );

                io.to(senderId).emit("userReadMessages", { readerId: receiverId });
            }
        } catch (err) {
            console.error("[Message] markRead error:", err);
        }
    });
};

module.exports = { registerMessageHandlers };
