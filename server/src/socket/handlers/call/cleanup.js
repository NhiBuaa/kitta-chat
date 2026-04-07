const mongoose = require("mongoose");
const CallHistory = require("../../../models/CallHistory");

const CLEANUP_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Mark "pending" calls older than 2 minutes as "unreachable".
 * Safe to call at any time; skips silently when DB is not connected.
 */
const runCleanup = async () => {
    if (mongoose.connection.readyState !== 1) return;

    try {
        const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);
        const result = await CallHistory.updateMany(
            { status: "pending", startedAt: { $lt: threshold } },
            { status: "unreachable", endedAt: new Date() },
        );
        if (result.modifiedCount > 0) {
            console.log(`[Cleanup] ${result.modifiedCount} pending → unreachable`);
        }
    } catch (err) {
        // Only log unexpected errors (not routine connection drops)
        if (err.name !== "MongooseError") {
            console.error("[Cleanup] error:", err.message);
        }
    }
};

// Run once on startup to clear stale records from the previous process
runCleanup();

// Then run on a fixed interval
setInterval(runCleanup, CLEANUP_INTERVAL_MS);

module.exports = { runCleanup };