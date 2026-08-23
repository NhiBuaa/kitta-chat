/**
 *
 * Registers all WebRTC call signalling and call-history socket handlers.
 * Import cleanup as a side-effect so the periodic cleanup starts on module load.
 *
 */

const { registerDisabledCallHandlers } = require("./disabled");

const initializeCallHandlers = ({ capabilities = { calls: true } } = {}) => {
    if (capabilities.calls === true) require("./cleanup");
};

/**
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerCallHandlers = (socket, io, {
    capabilities = { calls: true },
    measurement,
    rateLimiter,
} = {}) => {
    if (capabilities.calls !== true) {
        registerDisabledCallHandlers(socket);
        return;
    }

    initializeCallHandlers({ capabilities });
    const { registerInitCall } = require("./handlers/initCall");
    const { registerCallUser } = require("./handlers/callUser");
    const { registerAnswerCall } = require("./handlers/answerCall");
    const { registerEndCall } = require("./handlers/endCall");
    const { registerRejectCall } = require("./handlers/rejectCall");
    const { registerToggleMedia } = require("./handlers/toggleMedia");
    const { finalizeCallFromDisconnect } = require("./disconnect");
    const configuredRateLimiter = rateLimiter || io.rateLimiter;

    registerInitCall(socket, io, { measurement, rateLimiter: configuredRateLimiter });
    registerCallUser(socket, io, { measurement, rateLimiter: configuredRateLimiter });
    registerAnswerCall(socket, io);
    registerEndCall(socket, io);
    registerRejectCall(socket, io);
    registerToggleMedia(socket, io);

    socket.on("disconnect", (reason) => {
        console.log(`[CallHandler] Socket disconnect: ${socket.id} (user: ${socket.userId}) reason=${reason}`);
        finalizeCallFromDisconnect({ socketId: socket.id, userId: socket.userId, io });
    });
};

module.exports = { initializeCallHandlers, registerCallHandlers };
