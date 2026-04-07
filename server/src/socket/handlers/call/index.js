/**
 * call/index.js
 *
 * Registers all WebRTC call signalling and call-history socket handlers.
 * Import cleanup as a side-effect so the periodic cleanup starts on module load.
 *
 * Usage:
 *   const { registerCallHandlers } = require("./call");
 *   io.on("connection", (socket) => registerCallHandlers(socket, io));
 */

require("./cleanup"); // side-effect: starts the periodic cleanup interval

const { registerInitCall } = require("./handlers/initCall");
const { registerCallUser } = require("./handlers/callUser");
const { registerAnswerCall } = require("./handlers/answerCall");
const { registerEndCall } = require("./handlers/endCall");
const { registerRejectCall } = require("./handlers/rejectCall");
const { registerToggleMedia } = require("./handlers/toggleMedia");
const { finalizeCallFromDisconnect } = require("./disconnect");

/**
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerCallHandlers = (socket, io) => {
    registerInitCall(socket, io);
    registerCallUser(socket, io);
    registerAnswerCall(socket, io);
    registerEndCall(socket, io);
    registerRejectCall(socket, io);
    registerToggleMedia(socket, io);

    // Finalize any in-progress call when the socket disconnects unexpectedly
    socket.on("disconnect", () => {
        console.log(`[CallHandler] Socket disconnect: ${socket.id} (user: ${socket.userId})`);
        finalizeCallFromDisconnect({ socketId: socket.id, userId: socket.userId, io });
    });
};

module.exports = { registerCallHandlers };