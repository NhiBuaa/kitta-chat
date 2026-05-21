const mongoose = require("mongoose");
const CallHistory = require("../../../models/CallHistory");
const { unbindSocketFromCall, activeTimeouts } = require("./state");
const { emitCallLogMessage } = require("./callLog");
const { emitCallHistorySync, emitCallEndedToParticipants } = require("./emitters");
const { finalizeCallOnce } = require("./services/callFinalizer");
const { removeCallTimeoutDue } = require("./services/callTimeoutDueStore");
const {
    resolveSocketCallBinding,
    resolveUserActiveCall,
    removeSocketCallBinding,
    removeUserActiveCall,
} = require("./services/callSocketBindingStore");

const TERMINAL_STATUSES = ["completed", "missed", "rejected", "busy", "unreachable"];

/**
 * Called from the "disconnect" socket event.
 * Looks up whether the disconnected socket was mid-call and, if so, ends it
 * cleanly (completed if answered, rejected if not yet answered).
 *
 * @param {{ socketId: string, userId: string, io: import("socket.io").Server }} param
 */
const finalizeCallFromDisconnect = async ({ socketId, userId, io }) => {
    const redisClient = io.redisClient;
    const callId = await _resolveCallIdFromDisconnect({ socketId, userId, redisClient });
    await removeSocketCallBinding(socketId, redisClient);

    if (!callId) {
        await removeUserActiveCall(userId, redisClient);
        return;
    }

    try {
        const existingCall = await CallHistory.findById(callId);
        if (!existingCall) {
            await removeUserActiveCall(userId, redisClient);
            return;
        }

        if (TERMINAL_STATUSES.includes(existingCall.status) || existingCall.endedAt) {
            await _cleanupRedisBindings({ redisClient, socketId, userId, call: existingCall });
            return;
        }

        // Cancel any pending timeout
        const timeoutId = activeTimeouts.get(callId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            activeTimeouts.delete(callId);
        }
        await removeCallTimeoutDue({ redisClient, callId });

        const now = new Date();
        const status = existingCall.answeredAt ? "completed" : "rejected";
        const duration = existingCall.answeredAt
            ? Math.round((now - existingCall.answeredAt) / 1000)
            : null;

        const finalizeResult = await finalizeCallOnce({
            callId,
            status,
            endedBy: new mongoose.Types.ObjectId(userId),
            endedAt: now,
            duration,
            requireUnanswered: !existingCall.answeredAt,
            activeStatuses: ["pending"],
        });
        const updated = finalizeResult.call;

        await _cleanupRedisBindings({ redisClient, socketId, userId, call: updated ?? existingCall });

        if (!finalizeResult.finalized || !updated) {
            console.log(`[Disconnect] No-op for ${callId}; already answered/finalized by another path`);
            return;
        }

        emitCallHistorySync(io, updated, userId);
        emitCallLogMessage(io, finalizeResult.callLogMessage);

        const partnerId =
            updated.callerId?._id?.toString() === String(userId)
                ? updated.receiverId?._id?.toString()
                : updated.callerId?._id?.toString();

        if (partnerId) io.to(partnerId).emit("callEnded");

        console.log(`[Disconnect] Finalized call ${callId} after disconnect of socket ${socketId}`);
    } catch (err) {
        console.error("[Disconnect] finalizeCallFromDisconnect error:", err);
    }
};

const _resolveCallIdFromDisconnect = async ({ socketId, userId, redisClient }) => {
    const localCallId = unbindSocketFromCall(socketId);
    if (localCallId) return localCallId;

    const socketCallId = await resolveSocketCallBinding(socketId, redisClient);
    if (socketCallId) return socketCallId;

    return resolveUserActiveCall(userId, redisClient);
};

const _cleanupRedisBindings = async ({ redisClient, socketId, userId, call }) => {
    await removeSocketCallBinding(socketId, redisClient);
    await removeUserActiveCall(userId, redisClient);

    const callerId = call?.callerId?._id?.toString() ?? call?.callerId?.toString();
    const receiverId = call?.receiverId?._id?.toString() ?? call?.receiverId?.toString();

    if (callerId && callerId !== String(userId)) {
        await removeUserActiveCall(callerId, redisClient);
    }
    if (receiverId && receiverId !== String(userId)) {
        await removeUserActiveCall(receiverId, redisClient);
    }
};

module.exports = { finalizeCallFromDisconnect };
