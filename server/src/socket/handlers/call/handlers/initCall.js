const mongoose = require("mongoose");
const CallHistory = require("../../../../models/CallHistory");
const buildConversationId = require("../../../../utils/buildConversationId");
const { activeTimeouts, tempIdToDbId, bindSocketToCall } = require("../state");
const { CALL_TIMEOUT_MS } = require("../constants");
const { emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync } = require("../emitters");
const { storeTempCallMapping } = require("../services/callSessionResolver");
const {
    storeCallTimeoutDue,
    removeCallTimeoutDue,
} = require("../services/callTimeoutDueStore");
const { finalizeCallOnce } = require("../services/callFinalizer");

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
            await storeTempCallMapping({
                redisClient: io.redisClient,
                tempCallId: callId,
                callHistoryId: callRecordId,
            });
            console.log(`[initCall] MAPPED temp ${callId} -> ${callRecordId}`);

            bindSocketToCall(socket.id, callRecordId);

            const timeoutAt = Date.now() + CALL_TIMEOUT_MS;
            await storeCallTimeoutDue({
                redisClient: io.redisClient,
                callId: callRecordId,
                timeoutAt,
            });

            // Auto-miss after timeout
            const timeoutId = setTimeout(async () => {
                try {
                    const finalizeResult = await finalizeCallOnce({
                        callId: callRecordId,
                        status: "missed",
                        endedAt: new Date(),
                        requireUnanswered: true,
                        activeStatuses: ["pending"],
                    });
                    const updated = finalizeResult.call;

                    if (finalizeResult.finalized && updated) {
                        emitCallHistorySync(io, updated, userId);
                        emitCallLogMessage(io, finalizeResult.callLogMessage);
                        io.to(userId).emit("callTimeout", { callId: callRecordId });
                        io.to(userToCall).emit("callTimeout", { callId: callRecordId });
                    } else {
                        console.log(`[initCall] Timeout no-op for ${callRecordId}; already answered or finalized`);
                    }
                } catch (err) {
                    console.error("[initCall] timeout error:", err);
                } finally {
                    await removeCallTimeoutDue({ redisClient: io.redisClient, callId: callRecordId });
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
