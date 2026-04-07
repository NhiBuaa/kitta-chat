const mongoose = require("mongoose");
const CallHistory = require("../../../../models/CallHistory");
const buildConversationId = require("../../../../utils/buildConversationId");
const { activeTimeouts, tempIdToDbId, bindSocketToCall } = require("../state");
const { CALL_TIMEOUT_MS } = require("../constants");
const { createCallLogMessage } = require("../callLog");
const { emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync } = require("../emitters");

/**
 * "initCall" — client fires this immediately before sending the WebRTC offer
 * so we have a DB record in place before any signalling begins.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerInitCall = (socket, io) => {
    const userId = socket.userId;

    socket.on("initCall", async ({ userToCall, typeCall, callId, from }) => {
        console.log(`[initCall] ${userId} -> ${userToCall} (${typeCall}), tempCallId: ${callId}`);

        if (!callId || !callId.startsWith("temp_")) {
            console.warn(`[initCall] Invalid callId: ${callId}`);
            return;
        }

        try {
            const conversationId = buildConversationId(userId, userToCall);

            const callRecord = await CallHistory.create({
                callerId: new mongoose.Types.ObjectId(userId),
                receiverId: new mongoose.Types.ObjectId(userToCall),
                conversationId,
                type: typeCall,
                status: "pending",
                startedAt: new Date(),
            });

            const callRecordId = callRecord._id.toString();
            tempIdToDbId.set(callId, callRecordId);
            console.log(`[initCall] MAPPED temp ${callId} -> ${callRecordId}`);

            bindSocketToCall(socket.id, callRecordId);

            // Auto-miss after timeout
            const timeoutId = setTimeout(async () => {
                try {
                    const updated = await CallHistory.findOneAndUpdate(
                        { _id: callRecordId, status: "pending" },
                        { status: "missed", endedAt: new Date() },
                        { returnDocument: "after" },
                    ).populate([
                        { path: "callerId", select: "_id displayName avatar username" },
                        { path: "receiverId", select: "_id displayName avatar username" },
                    ]);

                    if (updated) {
                        const msg = await createCallLogMessage(updated);
                        emitCallHistorySync(io, updated, userId);
                        emitCallLogMessage(io, msg);
                        io.to(userId).emit("callTimeout", { callId: callRecordId });
                        io.to(userToCall).emit("callTimeout", { callId: callRecordId });
                    }
                } catch (err) {
                    console.error("[initCall] timeout error:", err);
                } finally {
                    activeTimeouts.delete(callRecordId);
                }
            }, CALL_TIMEOUT_MS);

            activeTimeouts.set(callRecordId, timeoutId);
        } catch (err) {
            console.error("[initCall] error:", err);
        }
    });
};

module.exports = { registerInitCall };