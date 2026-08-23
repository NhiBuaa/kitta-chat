const createSocketConnection = ({ authToken, configuredBase, ioClient }) => {
  const serverUrl = !configuredBase || configuredBase === "/"
    ? undefined
    : configuredBase;

  return ioClient(serverUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { token: authToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    connectTimeout: 10000,
    pingTimeout: 20000,
    pingInterval: 25000,
  });
};

export { createSocketConnection };
