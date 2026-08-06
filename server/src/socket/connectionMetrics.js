const { logSafely } = require("../utils/logger");

const ACTIVE_CONNECTION_METRIC = "kittachat_socket_active_connections";
const UNMATCHED_DISCONNECT_EVENT = "socket_active_connection_disconnect_unmatched";

const createSocketConnectionTracker = ({ metrics, logger = console } = {}) => {
  const trackedSockets = new Set();

  const observe = (event) => {
    if (!metrics || typeof metrics.observeSocketConnection !== "function") return;

    try {
      metrics.observeSocketConnection({ event });
    } catch (error) {
      logSafely(logger, "warn", "metrics_observation_failed", {
        metric: ACTIVE_CONNECTION_METRIC,
        error_type: error?.name || "Error",
      });
    }
  };

  const warnUnmatchedDisconnect = (reason) => {
    logSafely(logger, "warn", UNMATCHED_DISCONNECT_EVENT, {
      reason: reason || "unknown",
    });
  };

  const disconnect = (socket, reason) => {
    if (!trackedSockets.delete(socket)) {
      warnUnmatchedDisconnect(reason);
      return false;
    }

    observe("disconnected");
    return true;
  };

  const track = (socket) => {
    trackedSockets.add(socket);
    observe("connected");
    socket.once("disconnect", (reason) => disconnect(socket, reason));
  };

  return {
    disconnect,
    track,
  };
};

module.exports = {
  ACTIVE_CONNECTION_METRIC,
  UNMATCHED_DISCONNECT_EVENT,
  createSocketConnectionTracker,
};
