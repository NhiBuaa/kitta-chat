const SCHEMA = "k4-attribution-v1";

function createK4AttributionLogger({ env = process.env, write = (record) => console.log(JSON.stringify(record)), clock = () => new Date().toISOString() } = {}) {
  const enabled = env.K4_ATTRIBUTION_ENABLED === "true" && Boolean(env.K4_RUN_ID);
  const emit = (event, fields) => {
    if (!enabled) return;
    try {
      write({ schema: SCHEMA, runId: env.K4_RUN_ID, timestamp: clock(), event, ...fields });
    } catch (_error) {
      // Observation must never change a business result.
    }
  };
  return {
    socketConnected: (fields) => emit("socket_authenticated_connect", fields),
    socketDisconnected: (fields) => emit("socket_disconnect", fields),
    messageSender: (fields) => emit("message_sender", fields),
    messageAcknowledged: (fields) => emit("message_acknowledgement", fields),
    messageReceiver: (fields) => emit("message_receiver", fields),
  };
}

const k4Attribution = createK4AttributionLogger();

module.exports = { SCHEMA, createK4AttributionLogger, k4Attribution };
