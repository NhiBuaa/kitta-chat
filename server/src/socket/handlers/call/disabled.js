const CALL_INPUT_EVENTS = Object.freeze([
  "initCall",
  "callUser",
  "answerCall",
  "endCall",
  "rejectCall",
  "toggleMedia",
]);

const registerDisabledCallHandlers = (socket) => {
  for (const eventName of CALL_INPUT_EVENTS) {
    socket.on(eventName, () => {
      socket.emit("callRejected", { reason: "Call feature unavailable" });
    });
  }
};

module.exports = {
  CALL_INPUT_EVENTS,
  registerDisabledCallHandlers,
};
