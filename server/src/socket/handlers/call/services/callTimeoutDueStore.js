const CALL_TIMEOUTS_ZSET_KEY = "call:timeouts";
const CALL_TIMEOUT_DEBUG_TTL_SECONDS = 180;

const getCallTimeoutDebugKey = (callId) => `call:timeout:${callId}`;

const storeCallTimeoutDue = async ({ redisClient, callId, timeoutAt }) => {
    if (!redisClient || !callId || !Number.isFinite(timeoutAt)) return false;
    if (typeof redisClient.zAdd !== "function" || typeof redisClient.setEx !== "function") return false;

    try {
        await redisClient.zAdd(CALL_TIMEOUTS_ZSET_KEY, {
            score: timeoutAt,
            value: String(callId),
        });
        await redisClient.setEx(
            getCallTimeoutDebugKey(callId),
            CALL_TIMEOUT_DEBUG_TTL_SECONDS,
            JSON.stringify({ callId: String(callId), timeoutAt }),
        );
        return true;
    } catch (err) {
        console.warn("[CallTimeoutDueStore] Redis timeout due write failed:", err.message);
        return false;
    }
};

const removeCallTimeoutDue = async ({ redisClient, callId }) => {
    if (!redisClient || !callId) return false;
    if (typeof redisClient.zRem !== "function" || typeof redisClient.del !== "function") return false;

    try {
        await redisClient.zRem(CALL_TIMEOUTS_ZSET_KEY, String(callId));
        await redisClient.del(getCallTimeoutDebugKey(callId));
        return true;
    } catch (err) {
        console.warn("[CallTimeoutDueStore] Redis timeout due remove failed:", err.message);
        return false;
    }
};

module.exports = {
    CALL_TIMEOUTS_ZSET_KEY,
    CALL_TIMEOUT_DEBUG_TTL_SECONDS,
    getCallTimeoutDebugKey,
    storeCallTimeoutDue,
    removeCallTimeoutDue,
};
