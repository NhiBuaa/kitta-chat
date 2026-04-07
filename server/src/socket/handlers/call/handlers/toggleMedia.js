/**
 * "toggleMedia" — relay a cam/mic state change to the other participant.
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerToggleMedia = (socket, io) => {
    socket.on("toggleMedia", ({ to, cam, mic }) => {
        io.to(to).emit("updateMediaStatus", { cam, mic });
    });
};

module.exports = { registerToggleMedia };