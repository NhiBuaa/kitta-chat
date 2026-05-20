const { randomUUID } = require("crypto");
const { emitCallLogMessage } = require("../callLog");
const { emitCallHistorySync } = require("../emitters");
const { finalizeCallOnce } = require("./callFinalizer");
const {
    CALL_TIMEOUTS_ZSET_KEY,
    removeCallTimeoutDue,
} = require("./callTimeoutDueStore");

const CALL_TIMEOUT_FINALIZER_ENABLED_VALUES = ["1", "true", "yes", "on"];
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const FINALIZE_LOCK_TTL_SECONDS = 30;

const isDistributedTimeoutEnabled = (value = process.env.CALL_DISTRIBUTED_TIMEOUT_ENABLED) => (
    CALL_TIMEOUT_FINALIZER_ENABLED_VALUES.includes(String(value ?? "").toLowerCase())
);

const getCallFinalizeLockKey = (callId) => `call:finalize-lock:${callId}`;

const createCallTimeoutFinalizer = ({
    io,
    redisClient,
    enabled = isDistributedTimeoutEnabled(),
    pollIntervalMs = Number(process.env.CALL_DISTRIBUTED_TIMEOUT_POLL_MS) || DEFAULT_POLL_INTERVAL_MS,
    logger = console,
    now = () => Date.now(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    finalizeCallOnce: finalize = finalizeCallOnce,
} = {}) => {
    let intervalId = null;

    const pollOnce = async () => {
        if (!enabled) return { scanned: 0, processed: 0 };
        if (!redisClient || !io) return { scanned: 0, processed: 0 };
        if (typeof redisClient.zRangeByScore !== "function") return { scanned: 0, processed: 0 };

        try {
            const dueCallIds = await redisClient.zRangeByScore(CALL_TIMEOUTS_ZSET_KEY, 0, now());
            let processed = 0;

            for (const callId of dueCallIds) {
                const didProcess = await processDueCall({ callId: String(callId) });
                if (didProcess) processed += 1;
            }

            return { scanned: dueCallIds.length, processed };
        } catch (err) {
            logger.warn("[CallTimeoutFinalizer] Redis scan failed:", err.message);
            return { scanned: 0, processed: 0, error: err };
        }
    };

    const processDueCall = async ({ callId }) => {
        const locked = await acquireFinalizeLock({ redisClient, callId, logger });
        if (!locked) {
            logger.log?.(`[CallTimeoutFinalizer] Skip ${callId}; lock not acquired`);
            return false;
        }

        try {
            const result = await finalize({
                callId,
                status: "missed",
                endedAt: new Date(now()),
                requireUnanswered: true,
                activeStatuses: ["pending"],
            });

            if (result.finalized && result.call) {
                emitCallHistorySync(io, result.call, null);
                emitCallLogMessage(io, result.callLogMessage);
                emitCallTimeoutToParticipants(io, result.call, callId);
                await removeCallTimeoutDue({ redisClient, callId });
                logger.log?.(`[CallTimeoutFinalizer] Finalized missed call ${callId}`);
                return true;
            }

            if (shouldRemoveStaleDue(result)) {
                await removeCallTimeoutDue({ redisClient, callId });
            }

            logger.log?.(`[CallTimeoutFinalizer] No-op for ${callId}; already answered or finalized`);
            return true;
        } catch (err) {
            logger.warn("[CallTimeoutFinalizer] Finalize failed:", err.message);
            return false;
        }
    };

    const start = () => {
        if (!enabled) return { started: false, reason: "disabled" };
        if (intervalId) return { started: false, reason: "already-started" };

        intervalId = setIntervalFn(() => {
            pollOnce().catch((err) => logger.warn("[CallTimeoutFinalizer] Poll failed:", err.message));
        }, pollIntervalMs);
        intervalId?.unref?.();
        logger.log?.(`[CallTimeoutFinalizer] Started poller intervalMs=${pollIntervalMs}`);
        return { started: true };
    };

    const stop = () => {
        if (!intervalId) return false;
        clearIntervalFn(intervalId);
        intervalId = null;
        return true;
    };

    return {
        start,
        stop,
        pollOnce,
    };
};

const acquireFinalizeLock = async ({ redisClient, callId, logger = console }) => {
    if (!redisClient || typeof redisClient.set !== "function") return false;

    try {
        const result = await redisClient.set(
            getCallFinalizeLockKey(callId),
            randomUUID(),
            { NX: true, EX: FINALIZE_LOCK_TTL_SECONDS },
        );
        return result === "OK";
    } catch (err) {
        logger.warn("[CallTimeoutFinalizer] Redis lock failed:", err.message);
        return false;
    }
};

const shouldRemoveStaleDue = (result) => (
    Boolean(result?.alreadyFinalized || result?.call?.answeredAt || result?.call?.endedAt)
);

const emitCallTimeoutToParticipants = (io, call, callId) => {
    const callerId = call.callerId?._id?.toString() ?? call.callerId?.toString();
    const receiverId = call.receiverId?._id?.toString() ?? call.receiverId?.toString();
    if (callerId) io.to(callerId).emit("callTimeout", { callId });
    if (receiverId && receiverId !== callerId) io.to(receiverId).emit("callTimeout", { callId });
};

module.exports = {
    CALL_TIMEOUT_FINALIZER_ENABLED_VALUES,
    DEFAULT_POLL_INTERVAL_MS,
    FINALIZE_LOCK_TTL_SECONDS,
    createCallTimeoutFinalizer,
    getCallFinalizeLockKey,
    isDistributedTimeoutEnabled,
};
