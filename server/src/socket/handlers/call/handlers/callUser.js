const mongoose = require("mongoose");
const CallHistory = require("../../../../models/CallHistory");
const User = require("../../../../models/User");
const buildConversationId = require("../../../../utils/buildConversationId");
const { activeTimeouts, tempIdToDbId, bindSocketToCall } = require("../state");
const { CALL_TIMEOUT_MS } = require("../constants");
const { checkRateLimit } = require("../rateLimit");
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

/**
 * "callUser" — sends the WebRTC offer to the callee.
 * Handles call-glare (simultaneous mutual calls) deterministically.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerCallUser = (socket, io) => {
    const userId = socket.userId;

    socket.on("callUser", async ({
        userToCall, signalData, from, name, mediaStatus, typeCall, avatar, callId,
    }) => {
        console.log(`[callUser] ${userId} -> ${userToCall} (${typeCall}), clientCallId: ${callId}`);

        if (!callId) {
            console.warn("[callUser] received WITHOUT callId!");
        }

        if (!checkRateLimit(userId)) {
            socket.emit("callRejected", { reason: "Too many calls. Please wait." });
            return;
        }

        if (!userToCall || !typeCall) {
            socket.emit("callRejected", { reason: "Invalid call parameters" });
            return;
        }

        try {
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
                await _resolveGlare({
                    io, socket, userId, userToCall,
                    callRecordId, reverseCall,
                    from, name, avatar, mediaStatus, typeCall, signalData,
                    callerInfo, conversationId,
                });
                return;
            }

            // ── Normal call ───────────────────────────────────────────────────────
            const targetRoom = String(userToCall);
            let targetSockets = [];
            try {
                targetSockets = Array.from(await io.in(targetRoom).allSockets());
            } catch (err) {
                console.warn("[CALL_DIAG][server:callUser:allSockets:error]", {
                    callerUserId: userId,
                    userToCall: targetRoom,
                    callId: callRecordId,
                    error: err.message,
                });
            }

            console.log("[CALL_DIAG][server:callUser:beforeEmit]", {
                callerUserId: userId,
                callerSocketId: socket.id,
                userToCall: targetRoom,
                callId: callRecordId,
                targetSocketCount: targetSockets.length,
                targetSockets,
            });

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
            console.log("[CALL_DIAG][server:callUser:afterEmit]", {
                callerUserId: userId,
                userToCall: targetRoom,
                callId: callRecordId,
                targetSocketCount: targetSockets.length,
            });

            await _startTimeout({ io, callRecordId, userId, userToCall });
        } catch (err) {
            console.error("[callUser] error:", err);
            socket.emit("callRejected", { reason: "Server error" });
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
