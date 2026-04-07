const { activeSocketCalls } = require("./state");

// ─── callEnded ────────────────────────────────────────────────────────────────

/**
 * Emit "callEnded" to both participants via three escalating strategies:
 *  1. userId rooms  (primary)
 *  2. bound socketIds (fallback)
 *  3. Redis user_sockets sets (multi-device fallback)
 *
 * @param {import("socket.io").Server} io
 * @param {import("mongoose").Document} callRecord - populated CallHistory doc
 * @param {string} [callId]
 */
const emitCallEndedToParticipants = (io, callRecord, callId = null) => {
    try {
        const callerId = callRecord?.callerId?._id?.toString() ?? callRecord?.callerId?.toString();
        const receiverId = callRecord?.receiverId?._id?.toString() ?? callRecord?.receiverId?.toString();

        console.log(`[Emitters] emitCallEndedToParticipants: callId=${callId}, caller=${callerId}, receiver=${receiverId}`);

        let emittedCount = 0;

        // 1 — userId rooms
        if (callerId) { io.to(callerId).emit("callEnded"); emittedCount++; }
        if (receiverId) { io.to(receiverId).emit("callEnded"); emittedCount++; }

        // 2 — bound socket IDs
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

        // 3 — Redis multi-device fallback
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

// ─── callHistorySync ──────────────────────────────────────────────────────────

/**
 * Push a callHistorySync event to both call participants so their
 * history UI stays up-to-date without a full reload.
 *
 * @param {import("socket.io").Server} io
 * @param {import("mongoose").Document} callRecord - populated CallHistory doc
 * @param {string} triggerUserId - userId of the user who triggered the update
 */
const emitCallHistorySync = (io, callRecord, triggerUserId) => {
    try {
        const callerIdStr = callRecord.callerId?._id?.toString() ?? callRecord.callerId?.toString();
        const receiverIdStr = callRecord.receiverId?._id?.toString() ?? callRecord.receiverId?.toString();

        const isReadByCurrentUser = callRecord.readBy?.some(
            (id) => id.toString() === triggerUserId,
        ) ?? false;

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

        io.to(receiverIdStr).emit("callHistorySync", {
            ...base,
            direction: receiverIdStr === triggerUserId ? "incoming" : "outgoing",
        });
    } catch (err) {
        console.error("[Emitters] emitCallHistorySync error:", err);
    }
};

module.exports = { emitCallEndedToParticipants, emitCallHistorySync };