const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);

const isLoopbackFixtureHost = (hostname) => typeof hostname === "string"
  && LOOPBACK_HOSTS.has(hostname.toLowerCase());

export { isLoopbackFixtureHost };
