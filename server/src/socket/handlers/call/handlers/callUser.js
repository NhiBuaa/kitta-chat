const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const CallHistory = require("../../../../models/CallHistory");
const User = require("../../../../models/User");
const buildConversationId = require("../../../../utils/buildConversationId");
const { activeTimeouts, tempIdToDbId, bindSocketToCall } = require("../state");
const { CALL_TIMEOUT_MS } = require("../constants");
const { emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync } = require("../emitters");
const {
    resolveCallHistoryId,
    storeTempCallMapping,
} = require("../services/callSessionResolver");
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
const { createCallLogicalAttemptAdmission } = require("../../../../rateLimit/callLogicalAttemptAdmission");
const {
    abandonCallMeasurement,
    beginCallMeasurement,
    finishCallMeasurement,
} = require("../measurement");

/**
 * "callUser" — sends the WebRTC offer to the callee.
 * Handles call-glare (simultaneous mutual calls) deterministically.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerCallUser = (socket, io, { measurement, rateLimiter = io.rateLimiter } = {}) => {
    const userId = socket.userId;
    const admitLogicalCall = createCallLogicalAttemptAdmission({ rateLimiter });

    socket.on("callUser", async ({
        userToCall, signalData, from, name, mediaStatus, typeCall, avatar, callId,
    }) => {
        const handlerMeasurement = beginCallMeasurement(
            measurement,
            CALL_PHASE.CALL_USER,
            CALL_STAGE.HANDLER_ENTRY,
        );
        let handlerMeasurementFinished = false;
        let localLimitMeasurement;
        let localLimitMeasurementFinished = false;
        let validationMeasurement;
        let validationMeasurementFinished = false;
        let workMeasurement;
        let workMeasurementFinished = false;
        let signallingMeasurement;
        let signallingMeasurementFinished = false;
        try {
            console.log(`[callUser] ${userId} -> ${userToCall} (${typeCall}), clientCallId: ${callId}`);

            if (!callId) {
                console.warn("[callUser] received WITHOUT callId!");
            }

            validationMeasurement = beginCallMeasurement(
                measurement,
                CALL_PHASE.CALL_USER,
                CALL_STAGE.SYNTACTIC_VALIDATION,
            );
            if (!userToCall || !typeCall) {
                socket.emit("callRejected", { reason: "Invalid call parameters" });
                finishCallMeasurement(validationMeasurement, CALL_OUTCOME.STOPPED);
                validationMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.STOPPED);
                handlerMeasurementFinished = true;
                return;
            }
            finishCallMeasurement(validationMeasurement, CALL_OUTCOME.CONTINUED);
            validationMeasurementFinished = true;

            localLimitMeasurement = beginCallMeasurement(
                measurement,
                CALL_PHASE.CALL_USER,
                CALL_STAGE.CURRENT_LOCAL_LIMIT,
            );
            const effectiveCallId = callId || `temp_unmatched_${randomUUID()}`;
            let admission;
            try {
                admission = await admitLogicalCall({
                    caller: userId,
                    callee: String(userToCall),
                    clientCallId: effectiveCallId,
                    phase: "call_user_consumed",
                });
            } catch {
                admission = { unavailable: true };
            }

            if (admission?.unavailable) {
                socket.emit("RATE_LIMIT_UNAVAILABLE", { code: "RATE_LIMIT_UNAVAILABLE" });
                finishCallMeasurement(localLimitMeasurement, CALL_OUTCOME.SUPPRESSED);
                localLimitMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            if (!admission?.allowed) {
                socket.emit("RATE_LIMITED", {
                    code: "RATE_LIMITED",
                    retryAfterSeconds: Math.max(1, Math.ceil((admission.retryAfterMs || 0) / 1000)),
                });
                finishCallMeasurement(localLimitMeasurement, CALL_OUTCOME.SUPPRESSED);
                localLimitMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            if (admission.kind === "replay") {
                finishCallMeasurement(localLimitMeasurement, CALL_OUTCOME.SUPPRESSED);
                localLimitMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            finishCallMeasurement(localLimitMeasurement, CALL_OUTCOME.CONTINUED);
            localLimitMeasurementFinished = true;

            workMeasurement = beginCallMeasurement(
                measurement,
                CALL_PHASE.CALL_USER,
                CALL_STAGE.DB_REDIS_WORK,
            );
            const conversationId = buildConversationId(userId, userToCall);

            // ── Resolve / create CallHistory record ──────────────────────────────
            let callRecordId = null;

            if (callId?.startsWith("temp_")) {
                callRecordId = await resolveCallHistoryId({
                    callId,
                    userId,
                    userToCall,
                    redisClient: io.redisClient,
                    localTempIdToDbId: tempIdToDbId,
                });
                if (callRecordId) {
                    console.log(`[callUser] Reusing existing record ${callRecordId} from initCall`);
                }
            }

            if (!callRecordId) {
                console.log("[callUser] Creating NEW CallHistory record (no initCall record found)");
                const callRecord = await CallHistory.create({
                    callerId: new mongoose.Types.ObjectId(userId),
                    receiverId: new mongoose.Types.ObjectId(userToCall),
                    conversationId,
                    type: typeCall,
                    status: "pending",
                    startedAt: new Date(),
                });
                callRecordId = callRecord._id.toString();

                if (callId?.startsWith("temp_") && !tempIdToDbId.has(callId)) {
                    tempIdToDbId.set(callId, callRecordId);
                    await storeTempCallMapping({
                        redisClient: io.redisClient,
                        tempCallId: callId,
                        callHistoryId: callRecordId,
                    });
                    console.log(`[callUser] NEW mapping temp ${callId} -> ${callRecordId}`);
                }
            }

            bindSocketToCall(socket.id, callRecordId);
            await storeSocketCallBinding(socket.id, callRecordId, io.redisClient);
            await storeUserActiveCall(userId, callRecordId, io.redisClient);

            io.to(userId).emit("outgoingCallCreated", {
                callId: callRecordId,
                userToCall,
                conversationId,
                type: typeCall,
            });

            const callerInfo = await User.findById(userId)
                .select("_id displayName avatar username")
                .lean();

            // ── Call-glare detection ──────────────────────────────────────────────
            const reverseCall = await CallHistory.findOne({
                callerId: new mongoose.Types.ObjectId(userToCall),
                receiverId: new mongoose.Types.ObjectId(userId),
                status: "pending",
                startedAt: { $gte: new Date(Date.now() - 30_000) },
            }).lean();

            if (reverseCall) {
                finishCallMeasurement(workMeasurement, CALL_OUTCOME.CONTINUED);
                workMeasurementFinished = true;
                signallingMeasurement = beginCallMeasurement(
                    measurement,
                    CALL_PHASE.CALL_USER,
                    CALL_STAGE.SIGNALLING,
                );
                await _resolveGlare({
                    io, socket, userId, userToCall,
                    callRecordId, reverseCall,
                    from, name, avatar, mediaStatus, typeCall, signalData,
                    callerInfo, conversationId,
                });
                finishCallMeasurement(signallingMeasurement, CALL_OUTCOME.SUPPRESSED);
                signallingMeasurementFinished = true;
                finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.SUPPRESSED);
                handlerMeasurementFinished = true;
                return;
            }

            finishCallMeasurement(workMeasurement, CALL_OUTCOME.CONTINUED);
            workMeasurementFinished = true;
            signallingMeasurement = beginCallMeasurement(
                measurement,
                CALL_PHASE.CALL_USER,
                CALL_STAGE.SIGNALLING,
            );

            // ── Normal call ───────────────────────────────────────────────────────
            const targetRoom = String(userToCall);

            io.to(targetRoom).emit("callUser", {
                signal: signalData,
                from,
                callerDbId: userId,
                name: callerInfo?.displayName ?? name,
                avatar: callerInfo?.avatar ?? avatar ?? "",
                mediaStatus,
                typeCall,
                callId: callRecordId,
            });
            await storeUserActiveCall(userToCall, callRecordId, io.redisClient);

            await _startTimeout({ io, callRecordId, userId, userToCall });
            finishCallMeasurement(signallingMeasurement, CALL_OUTCOME.CONTINUED);
            signallingMeasurementFinished = true;
            finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.CONTINUED);
            handlerMeasurementFinished = true;
        } catch (err) {
            if (signallingMeasurement && !signallingMeasurementFinished) {
                finishCallMeasurement(signallingMeasurement, CALL_OUTCOME.ERROR);
            }
            if (!workMeasurementFinished) {
                finishCallMeasurement(workMeasurement, CALL_OUTCOME.ERROR);
            }
            finishCallMeasurement(handlerMeasurement, CALL_OUTCOME.ERROR);
            handlerMeasurementFinished = true;
            console.error("[callUser] error:", err);
            socket.emit("callRejected", { reason: "Server error" });
        } finally {
            if (localLimitMeasurement && !localLimitMeasurementFinished) {
                abandonCallMeasurement(localLimitMeasurement);
            }
            if (validationMeasurement && !validationMeasurementFinished) {
                abandonCallMeasurement(validationMeasurement);
            }
            if (workMeasurement && !workMeasurementFinished) {
                abandonCallMeasurement(workMeasurement);
            }
            if (signallingMeasurement && !signallingMeasurementFinished) {
                abandonCallMeasurement(signallingMeasurement);
            }
            if (!handlerMeasurementFinished) abandonCallMeasurement(handlerMeasurement);
        }
    });
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Start the 45-second "missed" timeout for an unanswered call. */
const _startTimeout = async ({ io, callRecordId, userId, userToCall }) => {
    const timeoutAt = Date.now() + CALL_TIMEOUT_MS;
    await storeCallTimeoutDue({
        redisClient: io.redisClient,
        callId: callRecordId,
        timeoutAt,
    });

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
                console.log(`[callUser] Timeout no-op for ${callRecordId}; already answered or finalized`);
            }
        } catch (err) {
            console.error("[callUser] timeout error:", err);
        } finally {
            await removeCallTimeoutDue({ redisClient: io.redisClient, callId: callRecordId });
            activeTimeouts.delete(callRecordId);
        }
    }, CALL_TIMEOUT_MS);

    activeTimeouts.set(callRecordId, timeoutId);
};

/**
 * Resolve call-glare: the higher socket ID wins (same as client-side logic).
 * Winner keeps its call; loser's call is marked "missed".
 */
const _resolveGlare = async ({
    io, socket, userId, userToCall,
    callRecordId, reverseCall,
    from, name, avatar, mediaStatus, typeCall, signalData,
    callerInfo, conversationId,
}) => {
    console.log(`[callUser] Glare DETECTED A=${userId} B=${userToCall} reverseCallId=${reverseCall._id}`);

    const mySocketId = from;
    const reverseSockets = await io.in(userToCall).allSockets();
    const reverseSocketId = [...reverseSockets][0] ?? null;
    const iAmWinner = mySocketId > reverseSocketId;
    const winnerId = iAmWinner ? userId : userToCall;
    const loserId = iAmWinner ? userToCall : userId;

    console.log(`[callUser] Glare: Winner=${winnerId}, Loser=${loserId}`);

    if (iAmWinner) {
        // Cancel loser's (B's) timeout and mark their call missed
        const reverseTimeout = activeTimeouts.get(reverseCall._id.toString());
        if (reverseTimeout) {
            clearTimeout(reverseTimeout);
            activeTimeouts.delete(reverseCall._id.toString());
        }
        await removeCallTimeoutDue({ redisClient: io.redisClient, callId: reverseCall._id.toString() });

        await CallHistory.findByIdAndUpdate(reverseCall._id, {
            status: "missed",
            endedAt: new Date(),
        });

        // Tell B to accept my (the winner's) call
        io.to(loserId).emit("glare", {
            winnerSocketId: mySocketId,
            winnerDbId: userId,
            winnerName: callerInfo?.displayName ?? name,
            winnerAvatar: callerInfo?.avatar ?? avatar ?? "",
            winnerMediaStatus: mediaStatus,
            winnerCallId: callRecordId,
            winnerSignal: signalData,
            myCallId: reverseCall._id.toString(),
            typeCall,
        });

        // Re-confirm outgoing call to winner (myself)
        io.to(userId).emit("outgoingCallCreated", {
            callId: callRecordId,
            userToCall,
            conversationId,
            type: typeCall,
        });
    } else {
        // I'm the loser — cancel my call
        const myTimeout = activeTimeouts.get(callRecordId);
        if (myTimeout) {
            clearTimeout(myTimeout);
            activeTimeouts.delete(callRecordId);
        }
        await removeCallTimeoutDue({ redisClient: io.redisClient, callId: callRecordId });

        await CallHistory.findByIdAndUpdate(callRecordId, {
            status: "missed",
            endedAt: new Date(),
        });

        io.to(userId).emit("glareLost", {
            winnerDbId: winnerId,
            winnerSignal: signalData,
            myCallId: callRecordId,
            typeCall,
        });
        // DO NOT emit outgoingCallCreated — loser has no outgoing call
    }
};

module.exports = { registerCallUser };
