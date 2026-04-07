const { activeSocketCalls } = require("./state");

/**
 * Emit a "callEnded" tới tất cả các socket liên quan
 *
 * @param {import("socket.io").Server} io
 * @param {import("mongoose").Document} callRecord
 * @param {string} [callId]
 */
const emitCallEndedToParticipants = (io, callRecord, callId = null) => {
    try {
        const callerId = callRecord?.callerId?._id?.toString() ?? callRecord?.callerId?.toString();
        const receiverId = callRecord?.receiverId?._id?.toString() ?? callRecord?.receiverId?.toString();

        console.log(`[Emitters] emitCallEndedToParticipants: callId=${callId}, caller=${callerId}, receiver=${receiverId}`);

        let emittedCount = 0;

        // userId rooms
        if (callerId) { io.to(callerId).emit("callEnded"); emittedCount++; }
        if (receiverId) { io.to(receiverId).emit("callEnded"); emittedCount++; }

        // bound socket IDs
        if (callId) {
            let boundCount = 0;
            for (const [socketId, boundCallId] of activeSocketCalls.entries()) {
                if (String(boundCallId) === String(callId)) {
                    io.to(socketId).emit("callEnded");
                    boundCount++;
                }
            }
            if (boundCount > 0) {
                console.log(`[Emitters] Reached ${boundCount} bound sockets for callId ${callId}`);
            }
        }

        // Redis multi-device fallback
        if (callerId && receiverId) {
            const redisClient = io.redisClient;
            if (redisClient) {
                Promise.all([
                    redisClient.sMembers(`user_sockets:${callerId}`),
                    redisClient.sMembers(`user_sockets:${receiverId}`),
                ]).then(([callerSockets, receiverSockets]) => {
                    [...callerSockets, ...receiverSockets].forEach((sid) => io.to(sid).emit("callEnded"));
                    const total = callerSockets.length + receiverSockets.length;
                    if (total > 0) {
                        console.log(`[Emitters] Redis fallback: emitted to ${total} device sockets`);
                    }
                }).catch((err) => console.error("[Emitters] Redis fallback error:", err));
            }
        }

        console.log(`[Emitters] emittedCount=${emittedCount}, callId=${callId}`);
    } catch (err) {
        console.error("[Emitters] emitCallEndedToParticipants error:", err);
    }
};


/**
 * Gửi sự kiện callHistorySync đến cả hai người tham gia cuộc gọi để 
 * giao diện lịch sử cuộc gọi của họ luôn được cập nhật mà không cần tải lại toàn bộ.
 *
 * @param {import("socket.io").Server} io
 * @param {import("mongoose").Document} callRecord
 * @param {string} triggerUserId
 */
const emitCallHistorySync = (io, callRecord, triggerUserId) => {
    try {
        const callerIdStr = callRecord.callerId?._id?.toString() ?? callRecord.callerId?.toString();
        const receiverIdStr = callRecord.receiverId?._id?.toString() ?? callRecord.receiverId?.toString();

        const isReadByCurrentUser = callRecord.readBy?.some(
            (id) => id.toString() === triggerUserId,
        ) ?? false;

        console.log(`[Emitters] emitCallHistorySync: triggerUserId=${triggerUserId}, caller=${callerIdStr}, receiver=${receiverIdStr}, isReadByCurrentUser=${isReadByCurrentUser}, status=${callRecord.status}, type=${callRecord.type}`);

        const base = {
            callId: callRecord._id.toString(),
            type: callRecord.type,
            status: callRecord.status,
            conversationId: callRecord.conversationId,
            callerId: callRecord.callerId,
            receiverId: callRecord.receiverId,
            startedAt: callRecord.startedAt,
            answeredAt: callRecord.answeredAt,
            endedAt: callRecord.endedAt,
            duration: callRecord.duration,
            isReadByCurrentUser,
        };

        io.to(callerIdStr).emit("callHistorySync", {
            ...base,
            direction: callerIdStr === triggerUserId ? "outgoing" : "incoming",
        });
        console.log(`[Emitters] -> emitted to caller (direction=outgoing)`);

        io.to(receiverIdStr).emit("callHistorySync", {
            ...base,
            direction: receiverIdStr === triggerUserId ? "incoming" : "outgoing",
        });
        console.log(`[Emitters] -> emitted to receiver (direction=incoming)`);
    } catch (err) {
        console.error("[Emitters] emitCallHistorySync error:", err);
    }
};

module.exports = { emitCallEndedToParticipants, emitCallHistorySync };