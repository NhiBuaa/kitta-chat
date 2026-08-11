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
const {
    storeSocketCallBinding,
    storeUserActiveCall,
} = require("../services/callSocketBindingStore");
const {
    CALL_OUTCOME,
    CALL_PHASE,
    CALL_STAGE,
} = require("../../../../observability/issue61");
const { isValidClientCallId } = require("../../../../rateLimit/keyBuilder");
const { createCallLogicalAttemptAdmission } = require("../../../../rateLimit/callLogicalAttemptAdmission");
const {
    abandonCallMeasurement,
    beginCallMeasurement,
    finishCallMeasurement,
} = require("../measurement");

/**
 * "initCall" — client fires this immediately before sending the WebRTC offer
 * so we have a DB record in place before any signalling begins.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerInitCall = (socket, io, { measurement, rateLimiter = io.rateLimiter } = {}) => {
    const userId = socket.userId;
    const admitLogicalCall = createCallLogicalAttemptAdmission({ rateLimiter });

    socket.on("initCall", async ({ userToCall, typeCall, callId, from }) => {
        const handlerMeasurement = beginCallMeasurement(
            measurement,
            CALL_PHASE.INIT_CALL,
            CALL_STAGE.HANDLER_ENTRY,
        );
        const validationMeasurement = beginCallMeasurement(
            measurement,
            CALL_PHASE.INIT_CALL,
            CALL_STAGE.SYNTACTIC_VALIDATION,
        );
        let validationMeasurementFinished = false;
        let workMeasurement;
        let workMeasurementFinished = false;
        let handlerMeasurementFinished = false;
        try {
            console.log(`[initCall] ${userId} -> ${userToCall} (${typeCall}), tempCallId: ${callId}`);

            if (!userToCall || !typeCall || !isValidClientCallId(callId) || !callId.startsWith("temp_") || callId.length <= 5) {
                console.warn(`[initCall] Invalid callId: ${callId}`);
                finishCallMeasurement(validationMeasurement, CALL_OUTCOME.STOPPED);
                validationMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.STOPPED);
                handlerMeasurementFinished = true;
                return;
            }

            let admission;
            try {
                admission = await admitLogicalCall({
                    caller: userId,
                    callee: String(userToCall),
                    clientCallId: callId,
                    phase: "init_pending",
                });
            } catch {
                admission = { unavailable: true };
            }

            if (admission?.unavailable) {
                socket.emit("RATE_LIMIT_UNAVAILABLE", { code: "RATE_LIMIT_UNAVAILABLE" });
                finishCallMeasurement(validationMeasurement, CALL_OUTCOME.SUPPRESSED);
                validationMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            if (!admission?.allowed) {
                socket.emit("RATE_LIMITED", {
                    code: "RATE_LIMITED",
                    retryAfterSeconds: Math.max(1, Math.ceil((admission.retryAfterMs || 0) / 1000)),
                });
                finishCallMeasurement(validationMeasurement, CALL_OUTCOME.SUPPRESSED);
                validationMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            if (admission.kind === "replay") {
                finishCallMeasurement(validationMeasurement, CALL_OUTCOME.SUPPRESSED);
                validationMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            finishCallMeasurement(validationMeasurement, CALL_OUTCOME.CONTINUED);
            validationMeasurementFinished = true;
            workMeasurement = beginCallMeasurement(
                measurement,
                CALL_PHASE.INIT_CALL,
                CALL_STAGE.DB_REDIS_WORK,
            );
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
            await storeSocketCallBinding(socket.id, callRecordId, io.redisClient);
            await storeUserActiveCall(userId, callRecordId, io.redisClient);

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
            finishCallMeasurement(workMeasurement, CALL_OUTCOME.CONTINUED);
            workMeasurementFinished = true;
            finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.CONTINUED);
            handlerMeasurementFinished = true;
        } catch (err) {
            if (workMeasurement && !workMeasurementFinished) {
                finishCallMeasurement(workMeasurement, CALL_OUTCOME.ERROR);
                workMeasurementFinished = true;
            }
            finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.ERROR);
            handlerMeasurementFinished = true;
            console.error("[initCall] error:", err);
        } finally {
            if (!validationMeasurementFinished) abandonCallMeasurement(validationMeasurement);
            if (workMeasurement && !workMeasurementFinished) abandonCallMeasurement(workMeasurement);
            if (!handlerMeasurementFinished) abandonCallMeasurement(handlerMeasurement);
        }
    });
};

module.exports = { registerInitCall };
