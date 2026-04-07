const mongoose = require("mongoose");
const CallHistory = require("../../../models/CallHistory");
const { activeTimeouts, tempIdToDbId, unbindSocketFromCall } = require("../state");
const { createCallLogMessage, emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync, emitCallEndedToParticipants } = require("../emitters");

const POPULATE = [
    { path: "callerId", select: "_id displayName avatar username" },
    { path: "receiverId", select: "_id displayName avatar username" },
];

/**
 * "endCall" — either participant ends an active call.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerEndCall = (socket, io) => {
    const userId = socket.userId;

    socket.on("endCall", async ({ to, callId }) => {
        unbindSocketFromCall(socket.id);

        const actualCallId = await _resolveCallId({ callId, userId, to, label: "endCall" });
        if (!actualCallId) return;

        try {
            const call = await CallHistory.findById(actualCallId).populate(POPULATE);
            if (!call) {
                console.log(`[endCall] CallHistory not found: ${actualCallId}`);
                return;
            }

            // Idempotent: already ended → just re-emit so the UI closes
            if (call.endedBy) {
                console.log(`[endCall] Idempotent: ${actualCallId} already ended`);
                emitCallEndedToParticipants(io, call, actualCallId);
                return;
            }

            _cancelTimeout(actualCallId);

            const now = new Date();
            const duration = call.answeredAt
                ? Math.round((now - call.answeredAt) / 1000)
                : null;

            const updated = await CallHistory.findByIdAndUpdate(
                actualCallId,
                { status: "completed", endedBy: new mongoose.Types.ObjectId(userId), endedAt: now, duration },
                { returnDocument: "after" },
            ).populate(POPULATE);

            if (updated) {
                console.log(`[endCall] ${actualCallId} -> completed (${duration}s)`);
                const msg = await createCallLogMessage(updated);
                emitCallHistorySync(io, updated, userId);
                emitCallLogMessage(io, msg);
                emitCallEndedToParticipants(io, updated, actualCallId);
            }
        } catch (err) {
            console.error("[endCall] error:", err);
            if (err.name === "CastError") {
                await _emergencyEnd({ io, userId, to });
            }
        }
    });
};

// ─── Private helpers ──────────────────────────────────────────────────────────

const _cancelTimeout = (callId) => {
    const t = activeTimeouts.get(callId);
    if (t) { clearTimeout(t); activeTimeouts.delete(callId); }
};

/**
 * Resolve a potentially-temp callId to a real DB ObjectId string.
 * Falls back to a DB search when needed.
 */
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
        actual = await _searchPendingCall({ userId, to, windowMs: 60_000 });
        if (actual) {
            console.log(`[${label}] Fallback DB search found: ${actual}`);
        } else {
            console.log(`[${label}] Cannot find valid callId — aborting`);
        }
    }

    return actual && !actual.startsWith("temp_") ? actual : null;
};

/** Search for the most recent pending/ringing call between two users. */
const _searchPendingCall = async ({ userId, to, windowMs }) => {
    try {
        const after = new Date(Date.now() - windowMs);
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const toIdObj = new mongoose.Types.ObjectId(to);

        const call = await CallHistory.findOne({
            $or: [
                { callerId: userIdObj, receiverId: toIdObj },
                { callerId: toIdObj, receiverId: userIdObj },
            ],
            status: { $in: ["pending", "ringing"] },
            startedAt: { $gte: after },
        }).lean();

        return call?._id?.toString() ?? null;
    } catch {
        return null;
    }
};

/** Last-resort end when we had a CastError on the main path. */
const _emergencyEnd = async ({ io, userId, to }) => {
    console.log("[endCall] Emergency fallback triggered");
    try {
        const after = new Date(Date.now() - 120_000);
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const toIdObj = new mongoose.Types.ObjectId(to);

        const call = await CallHistory.findOne({
            $or: [
                { callerId: userIdObj, receiverId: toIdObj },
                { callerId: toIdObj, receiverId: userIdObj },
            ],
            status: { $in: ["pending", "connecting", "connected"] },
            startedAt: { $gte: after },
        }).lean();

        if (!call) return;

        const now = new Date();
        const duration = call.answeredAt ? Math.round((now - call.answeredAt) / 1000) : null;

        const updated = await CallHistory.findByIdAndUpdate(
            call._id,
            { status: "completed", endedBy: new mongoose.Types.ObjectId(userId), endedAt: now, duration },
            { returnDocument: "after" },
        ).populate([
            { path: "callerId", select: "_id displayName avatar username" },
            { path: "receiverId", select: "_id displayName avatar username" },
        ]);

        if (updated) {
            const msg = await createCallLogMessage(updated);
            emitCallHistorySync(io, updated, userId);
            emitCallLogMessage(io, msg);
            emitCallEndedToParticipants(io, updated, call._id);
        }
    } catch (err) {
        console.error("[endCall] Emergency fallback error:", err);
    }
};

module.exports = { registerEndCall };