const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const parseArguments = (argv) => {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("acceptance arguments must be named value pairs");
    }
    options[key.slice(2)] = value;
  }
  return options;
};

const listen = async (server, port) => {
  server.listen(port, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
};

const close = async (server) => {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
};

const portIsReleased = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ host: "127.0.0.1", port });
  socket.once("connect", () => {
    socket.destroy();
    resolve(false);
  });
  socket.once("error", () => resolve(true));
  socket.setTimeout(1_000, () => {
    socket.destroy();
    resolve(true);
  });
});

const withLoopbackServer = async ({ handler, port }, callback) => {
  const server = http.createServer(handler || ((_req, res) => res.end("ready")));
  await listen(server, port);
  try {
    return await callback(server);
  } finally {
    await close(server);
  }
};

const emptySideEffects = () => ({
  limiter: 0,
  controller: 0,
  provider: 0,
  database: 0,
  queue: 0,
  s3: 0,
  bodyProcessing: 0,
  signaling: 0,
  history: 0,
  session: 0,
});

const writeObservation = ({ output, observation }) => {
  const serialized = `${JSON.stringify(observation, null, 2)}\n`;
  const forbidden = [
    /authorization\s*:/i,
    /bearer\s+[a-z0-9._~+/=-]{16,}/i,
    /(?:password|secret|token|cookie|credential)\s*[:=]/i,
    /(?:mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s/@:]+:[^\s/@]+@/i,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error("observation contains forbidden secret-bearing evidence");
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), serialized, "utf8");
};

module.exports = {
  close,
  emptySideEffects,
  listen,
  parseArguments,
  portIsReleased,
  withLoopbackServer,
  writeObservation,
};
