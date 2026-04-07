/**
 * In-memory call state shared across all handlers.
 *
 * These Maps are module-level singletons — they persist for the lifetime
 * of the Node process and are intentionally shared.
 */

/** callId → NodeJS timeout handle */
const activeTimeouts = new Map();

/** socketId → callId (real DB _id) */
const activeSocketCalls = new Map();

/** temp client callId → real CallHistory _id */
const tempIdToDbId = new Map();

/** userId → { count, windowStart } for rate-limiting */
const callRateLimit = new Map();

// ─── socket ↔ call binding ────────────────────────────────────────────────

const bindSocketToCall = (socketId, callId) => {
    if (!socketId || !callId) return;
    activeSocketCalls.set(socketId, callId);
};

/**
 * Remove the socket→call binding and return the previously bound callId
 * (or null if the socket had no binding).
 */
const unbindSocketFromCall = (socketId) => {
    if (!socketId) return null;
    const callId = activeSocketCalls.get(socketId) ?? null;
    activeSocketCalls.delete(socketId);
    return callId;
};

module.exports = {
    activeTimeouts,
    activeSocketCalls,
    tempIdToDbId,
    callRateLimit,
    bindSocketToCall,
    unbindSocketFromCall,
};