const emitToRoom = (io, roomId, eventName, payload) => {
  if (!io || !roomId || !eventName) return;
  io.to(String(roomId)).emit(eventName, payload);
};

const emitToUser = (io, userId, eventName, payload) => {
  emitToRoom(io, userId, eventName, payload);
};

const emitToSocket = (io, socketId, eventName, payload) => {
  emitToRoom(io, socketId, eventName, payload);
};

const emitToConversation = (io, conversationId, eventName, payload) => {
  emitToRoom(io, conversationId, eventName, payload);
};

const emitServerSide = (io, eventName, payload) => {
  if (!io || !eventName || typeof io.serverSideEmit !== "function") return;
  io.serverSideEmit(eventName, payload);
};

module.exports = {
  emitServerSide,
  emitToConversation,
  emitToRoom,
  emitToSocket,
  emitToUser,
};
