const mongoose = require("mongoose");
const CallHistory = require("../../../../models/CallHistory");
const { activeTimeouts, tempIdToDbId, unbindSocketFromCall } = require("../state");
const { createCallLogMessage, emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync, emitCallEndedToParticipants } = require("../emitters");

const POPULATE = [
    { path: "callerId", select: "_id displayName avatar username" },
    { path: "receiverId", select: "_id displayName avatar username" },
];

/** Derive the final call status from the rejection reason. */
const deriveStatus = (reason, answeredAt) => {
    if (reason === "busy") return "busy";
    if (reason === "cancelled") return "missed";
    if (answeredAt) return "completed";
    return "rejected";
};

/**
 * "rejectCall" — callee declines, caller cancels, or the user is busy.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerRejectCall = (socket, io) => {
    const userId = socket.userId;

    socket.on("rejectCall", async ({ to, callId, reason }) => {
        unbindSocketFromCall(socket.id);

        const actualCallId = await _resolveCallId({ callId, userId, to, label: "rejectCall" });
        if (!actualCallId) return;

        _cancelTimeout(actualCallId);

        try {
            const call = await CallHistory.findById(actualCallId);
            if (!call) {
                console.log(`[rejectCall] CallHistory not found: ${actualCallId}`);
                return;
            }

            const status = deriveStatus(reason, call.answeredAt);
            const updated = await CallHistory.findByIdAndUpdate(
                actualCallId,
                { status, endedAt: new Date(), endedBy: new mongoose.Types.ObjectId(userId) },
                { returnDocument: "after" },
            ).populate(POPULATE);

            if (updated) {
                console.log(`[rejectCall] ${actualCallId} -> "${status}"`);
                console.log(`[rejectCall] Will emit callHistorySync to caller=${userId} receiver=${to}`);
                const msg = await createCallLogMessage(updated);
                emitCallHistorySync(io, updated, userId);
                emitCallLogMessage(io, msg);
                _broadcastEnd({ io, updated, actualCallId, to, reason, userId });
                console.log(`[rejectCall] Finished emitting all events`);
            }
        } catch (err) {
            console.error("[rejectCall] error:", err);
            const needsFallback = err.name === "CastError" || actualCallId?.startsWith("temp_");
            if (needsFallback) {
                await _emergencyReject({ io, userId, to, reason });
            }
        }
    });
};

// ─── Private helpers ──────────────────────────────────────────────────────────

const _cancelTimeout = (callId) => {
    const t = activeTimeouts.get(callId);
    if (t) { clearTimeout(t); activeTimeouts.delete(callId); }
};

const _resolveCallId = async ({ callId, userId, to, label }) => {
    let actual = callId;

    if (actual?.startsWith("temp_")) {
        const mapped = tempIdToDbId.get(actual);
        if (mapped) {
            console.log(`[${label}] Resolved temp ${actual} -> ${mapped}`);
            tempIdToDbId.delete(actual);
            actual = mapped;
        } else {
            console.log(`[${label}] No mapping for temp ${actual}, falling back to DB search`);
            actual = null;
        }
    }

    if (!actual || actual.startsWith("temp_")) {
        // Strict: only find where THIS user is the caller (avoids glare cross-matches)
        actual = await _searchPendingCall({ callerId: userId, receiverId: to, windowMs: 60_000 });
        if (actual) {
            console.log(`[${label}] Fallback DB search found: ${actual}`);
        } else {
            console.log(`[${label}] Cannot find valid callId — aborting`);
        }
    }

    return actual && !actual.startsWith("temp_") ? actual : null;
};

const _searchPendingCall = async ({ callerId, receiverId, windowMs }) => {
    try {
        const call = await CallHistory.findOne({
            callerId: new mongoose.Types.ObjectId(callerId),
            receiverId: new mongoose.Types.ObjectId(receiverId),
            status: "pending",
            startedAt: { $gte: new Date(Date.now() - windowMs) },
        }).lean();
        return call?._id?.toString() ?? null;
    } catch {
        return null;
    }
};

/** Emit the correct end events based on rejection reason. */
const _broadcastEnd = ({ io, updated, actualCallId, to, reason, userId }) => {
    if (reason === "cancelled") {
        // Caller cancelled → silently close the receiver's notification only
        const receiverId = updated.receiverId?._id?.toString() ?? updated.receiverId?.toString();
        if (receiverId) io.to(receiverId).emit("callEnded");
        io.to(to).emit("callCancelled", { callId: actualCallId, reason: "cancelled" });
    } else {
        emitCallEndedToParticipants(io, updated, actualCallId);
        io.to(to).emit("callRejected", { reason: reason ?? "User busy" });
    }
};

const _emergencyReject = async ({ io, userId, to, reason }) => {
    console.log("[rejectCall] Emergency fallback triggered");
    try {
        const call = await CallHistory.findOne({
            callerId: new mongoose.Types.ObjectId(userId),
            receiverId: new mongoose.Types.ObjectId(to),
            status: "pending",
            startedAt: { $gte: new Date(Date.now() - 120_000) },
        }).lean();

        if (!call) return;

        const status = deriveStatus(reason, call.answeredAt);
        const updated = await CallHistory.findByIdAndUpdate(
            call._id,
            { status, endedAt: new Date(), endedBy: new mongoose.Types.ObjectId(userId) },
            { returnDocument: "after" },
        ).populate(POPULATE);

        if (updated) {
            const msg = await createCallLogMessage(updated);
            emitCallHistorySync(io, updated, userId);
            emitCallLogMessage(io, msg);
            _broadcastEnd({ io, updated, actualCallId: call._id.toString(), to, reason, userId });
        }
    } catch (err) {
        console.error("[rejectCall] Emergency fallback error:", err);
    }
};

module.exports = { registerRejectCall };