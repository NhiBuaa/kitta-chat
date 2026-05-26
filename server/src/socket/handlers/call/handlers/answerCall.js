const CallHistory = require("../../../../models/CallHistory");
const { activeTimeouts, bindSocketToCall } = require("../state");
const { removeCallTimeoutDue } = require("../services/callTimeoutDueStore");
const {
    storeSocketCallBinding,
    storeUserActiveCall,
} = require("../services/callSocketBindingStore");

/**
 * "answerCall" — callee accepts the incoming call.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerAnswerCall = (socket, io) => {
    const userId = socket.userId;

    socket.on("answerCall", async ({ to, signal, mediaStatus, callId }) => {
        console.log(`[answerCall] ${userId} -> ${to}, callId: ${callId}`);

        bindSocketToCall(socket.id, callId);
        await storeSocketCallBinding(socket.id, callId, io.redisClient);
        await storeUserActiveCall(userId, callId, io.redisClient);

        // Cancel the missed-call timeout
        if (callId) {
            const timeoutId = activeTimeouts.get(callId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                activeTimeouts.delete(callId);
            }
            await removeCallTimeoutDue({ redisClient: io.redisClient, callId });

            try {
                await CallHistory.findByIdAndUpdate(callId, { answeredAt: new Date() });
            } catch (err) {
                console.error("[answerCall] DB update error:", err);
            }
        }

        io.to(to).emit("callAccepted", { signal, mediaStatus });
    });
};

module.exports = { registerAnswerCall };
