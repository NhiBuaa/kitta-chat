const mongoose = require("mongoose");
const CallHistory = require("../../../models/CallHistory");
const { unbindSocketFromCall, activeTimeouts } = require("./state");
const { createCallLogMessage } = require("./callLog");
const { emitCallLogMessage } = require("./callLog");
const { emitCallHistorySync, emitCallEndedToParticipants } = require("./emitters");

const TERMINAL_STATUSES = ["completed", "missed", "rejected", "busy", "unreachable"];

/**
 * Called from the "disconnect" socket event.
 * Looks up whether the disconnected socket was mid-call and, if so, ends it
 * cleanly (completed if answered, rejected if not yet answered).
 *
 * @param {{ socketId: string, userId: string, io: import("socket.io").Server }} param
 */
const finalizeCallFromDisconnect = async ({ socketId, userId, io }) => {
    const callId = unbindSocketFromCall(socketId);
    if (!callId) return;

    try {
        const existingCall = await CallHistory.findById(callId);
        if (!existingCall || existingCall.endedBy) return;
        if (TERMINAL_STATUSES.includes(existingCall.status)) return;

        // Cancel any pending timeout
        const timeoutId = activeTimeouts.get(callId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            activeTimeouts.delete(callId);
        }

        const now = new Date();
        const status = existingCall.answeredAt ? "completed" : "rejected";
        const duration = existingCall.answeredAt
            ? Math.round((now - existingCall.answeredAt) / 1000)
            : null;

        const updated = await CallHistory.findByIdAndUpdate(
            callId,
            { status, endedBy: new mongoose.Types.ObjectId(userId), endedAt: now, duration },
            { returnDocument: "after" },
        ).populate([
            { path: "callerId", select: "_id displayName avatar username" },
            { path: "receiverId", select: "_id displayName avatar username" },
        ]);

        if (!updated) return;

        const callLogMessage = await createCallLogMessage(updated);
        emitCallHistorySync(io, updated, userId);
        emitCallLogMessage(io, callLogMessage);

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

module.exports = { finalizeCallFromDisconnect };