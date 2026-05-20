const mongoose = require("mongoose");
const CallHistory = require("../../../../models/CallHistory");

const TEMP_CALL_MAPPING_TTL_SECONDS = 120;

const isRealCallHistoryId = (callId) => (
    typeof callId === "string" && mongoose.Types.ObjectId.isValid(callId)
);

const getTempCallKey = (tempCallId) => `call:temp:${tempCallId}`;

const storeTempCallMapping = async ({ redisClient, tempCallId, callHistoryId }) => {
    if (!redisClient || !tempCallId?.startsWith("temp_") || !callHistoryId) return;

    try {
        await redisClient.setEx(
            getTempCallKey(tempCallId),
            TEMP_CALL_MAPPING_TTL_SECONDS,
            String(callHistoryId),
        );
    } catch (err) {
        console.warn("[CallSessionResolver] Redis temp mapping write failed:", err.message);
    }
};

const resolveCallHistoryId = async ({
    callId,
    userId,
    userToCall,
    redisClient,
    localTempIdToDbId,
    windowMs = 60_000,
}) => {
    if (isRealCallHistoryId(callId)) return callId;
    if (!callId?.startsWith("temp_")) return null;

    const redisMapped = await getRedisTempMapping(redisClient, callId);
    if (isRealCallHistoryId(redisMapped)) return redisMapped;

    const localMapped = localTempIdToDbId?.get?.(callId) ?? null;
    if (isRealCallHistoryId(localMapped)) return localMapped;

    return findRecentPendingCall({ userId, userToCall, windowMs });
};

const getRedisTempMapping = async (redisClient, tempCallId) => {
    if (!redisClient) return null;

    try {
        return await redisClient.get(getTempCallKey(tempCallId));
    } catch (err) {
        console.warn("[CallSessionResolver] Redis temp mapping read failed:", err.message);
        return null;
    }
};

const findRecentPendingCall = async ({ userId, userToCall, windowMs }) => {
    if (!isRealCallHistoryId(userId) || !isRealCallHistoryId(userToCall)) return null;

    try {
        const after = new Date(Date.now() - windowMs);
        const userIdObj = new mongoose.Types.ObjectId(userId);
        const userToCallObj = new mongoose.Types.ObjectId(userToCall);

        const call = await CallHistory.findOne({
            $or: [
                { callerId: userIdObj, receiverId: userToCallObj },
                { callerId: userToCallObj, receiverId: userIdObj },
            ],
            status: "pending",
            startedAt: { $gte: after },
        }).lean();

        return call?._id?.toString() ?? null;
    } catch (err) {
        console.warn("[CallSessionResolver] Mongo pending call lookup failed:", err.message);
        return null;
    }
};

module.exports = {
    TEMP_CALL_MAPPING_TTL_SECONDS,
    getTempCallKey,
    storeTempCallMapping,
    resolveCallHistoryId,
};
