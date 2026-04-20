const Message = require("../../../models/Message");

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

        const filter = { "callData.callHistoryId": callRecord._id, type: "call_log" };
        const update = {
            $set: {
                conversationId: callRecord.conversationId,
                sender: callRecord.callerId,
                receiver: callRecord.receiverId,
                text: "",
                attachments: [],
                "callData.type": callRecord.type,
                "callData.status": callRecord.status,
                "callData.startedAt": callRecord.startedAt,
                "callData.duration": callRecord.duration,
            },
            $setOnInsert: {
                type: "call_log",
                "callData.callHistoryId": callRecord._id,
            },
        };

        const saved = await Message.findOneAndUpdate(
            filter,
            update,
            {
                upsert: true,
                returnDocument: "after",
                setDefaultsOnInsert: true,
            },
        );

        console.log(`[CallLog] Created call_log message ${saved._id} for call ${callRecord._id}`);
        return await Message.findById(saved._id).populate(populate);
    } catch (err) {
        if (err?.code === 11000) {
            try {
                const existing = await Message.findOne({
                    type: "call_log",
                    "callData.callHistoryId": callRecord._id,
                }).populate(populate);
                if (existing) return existing;
            } catch (findErr) {
                console.error("[CallLog] duplicate recovery error:", findErr);
            }
        }
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