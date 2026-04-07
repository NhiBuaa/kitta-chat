const Message = require("../../models/Message");

// ─── DB ──────────────────────────────────────────────────────────────────────

/**
 * Upsert a Message of type "call_log" for the given CallHistory record.
 * If a message already exists it is updated (status / duration), not duplicated.
 *
 * @param {import("mongoose").Document} callRecord - populated CallHistory doc
 * @returns {Promise<import("mongoose").Document|null>}
 */
const createCallLogMessage = async (callRecord) => {
    try {
        const populate = [
            { path: "sender", select: "_id displayName avatar username" },
            { path: "receiver", select: "_id displayName avatar username" },
        ];

        const existing = await Message.findOne({ "callData.callHistoryId": callRecord._id });

        if (existing) {
            if (existing.callData.status !== callRecord.status) {
                existing.callData.status = callRecord.status;
                existing.callData.duration = callRecord.duration;
                await existing.save();
            }
            return await Message.findById(existing._id).populate(populate);
        }

        const saved = await new Message({
            conversationId: callRecord.conversationId,
            type: "call_log",
            sender: callRecord.callerId,
            receiver: callRecord.receiverId,
            text: "",
            attachments: [],
            callData: {
                callHistoryId: callRecord._id,
                type: callRecord.type,
                status: callRecord.status,
                startedAt: callRecord.startedAt,
                duration: callRecord.duration,
            },
        }).save();

        console.log(`[CallLog] Created call_log message ${saved._id} for call ${callRecord._id}`);
        return await Message.findById(saved._id).populate(populate);
    } catch (err) {
        console.error("[CallLog] createCallLogMessage error:", err);
        return null;
    }
};

// ─── Socket emit ─────────────────────────────────────────────────────────────

/**
 * Broadcast a call_log message to both participants.
 *
 * @param {import("socket.io").Server} io
 * @param {import("mongoose").Document|null} messageDoc
 */
const emitCallLogMessage = (io, messageDoc) => {
    if (!messageDoc) return;

    const senderId = messageDoc.sender?._id?.toString() ?? messageDoc.sender?.toString();
    const receiverId = messageDoc.receiver?._id?.toString() ?? messageDoc.receiver?.toString();
    if (!senderId || !receiverId) return;

    const payload = {
        _id: messageDoc._id,
        conversationId: messageDoc.conversationId,
        type: messageDoc.type,
        sender: messageDoc.sender,
        senderId,
        receiver: messageDoc.receiver,
        receiverId,
        text: messageDoc.text ?? "",
        attachments: [],
        callData: messageDoc.callData,
        createdAt: messageDoc.createdAt,
    };

    io.to(senderId).emit("getMessage", payload);
    io.to(receiverId).emit("getMessage", payload);
    io.to(senderId).emit("callLogMessage", payload);
    io.to(receiverId).emit("callLogMessage", payload);
};

module.exports = { createCallLogMessage, emitCallLogMessage };