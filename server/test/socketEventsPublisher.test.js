const assert = require("node:assert/strict");
const test = require("node:test");

const { SOCKET_EVENTS, SERVER_SIDE_EVENTS } = require("../src/socket/socketEvents");
const {
  emitToRoom,
  emitToUser,
  emitToSocket,
  emitServerSide,
} = require("../src/socket/realtimePublisher");

test("server socket event constants preserve existing wire names", () => {
  assert.equal(SOCKET_EVENTS.MESSAGE_SEND, "sendMessage");
  assert.equal(SOCKET_EVENTS.MESSAGE_RECEIVE, "getMessage");
  assert.equal(SOCKET_EVENTS.MESSAGE_MARK_READ, "markRead");
  assert.equal(SOCKET_EVENTS.MESSAGE_READ, "userReadMessages");
  assert.equal(SOCKET_EVENTS.GROUP_MESSAGE_READ, "groupUserRead");
  assert.equal(SERVER_SIDE_EVENTS.MESSAGE_DISPATCHED_PROOF, "proof:message-dispatched");
});

test("realtime publisher emits to the same rooms and sockets", () => {
  const emissions = [];
  const io = {
    to(target) {
      return {
        emit(eventName, payload) {
          emissions.push({ target, eventName, payload });
        },
      };
    },
    serverSideEmit(eventName, payload) {
      emissions.push({ target: "server-side", eventName, payload });
    },
  };

  emitToRoom(io, "room-1", "event-a", { ok: true });
  emitToUser(io, "user-1", "event-b", { ok: true });
  emitToSocket(io, "socket-1", "event-c", { ok: true });
  emitServerSide(io, "event-d", { ok: true });

  assert.deepEqual(emissions, [
    { target: "room-1", eventName: "event-a", payload: { ok: true } },
    { target: "user-1", eventName: "event-b", payload: { ok: true } },
    { target: "socket-1", eventName: "event-c", payload: { ok: true } },
    { target: "server-side", eventName: "event-d", payload: { ok: true } },
  ]);
});
