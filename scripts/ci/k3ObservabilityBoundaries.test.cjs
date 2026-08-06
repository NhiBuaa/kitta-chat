const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const repositoryRoot = path.resolve(__dirname, "../..");

const readRepositoryFile = (relativePath) => readFileSync(
  path.join(repositoryRoot, relativePath),
  "utf8",
);

test("nginx does not expose or proxy the internal /metrics endpoint", () => {
  const nginx = readRepositoryFile("nginx/nginx.conf");

  assert.doesNotMatch(nginx, /location\s+(?:=|\^~|~\*?)?\s*\/metrics\b/i);
  assert.doesNotMatch(nginx, /proxy_pass[^;\r\n]*\/metrics\b/i);
});

test("Compose keeps backend port 3000 internal and nginx owns public ports", () => {
  const compose = parse(readRepositoryFile("docker-compose.yml"));
  const backend = compose?.services?.backend;
  const nginx = compose?.services?.nginx;

  assert.ok(backend);
  assert.ok(nginx);
  assert.equal(Object.hasOwn(backend, "ports"), false);
  assert.deepEqual(nginx.ports, ["80:80", "443:443"]);
  assert.ok(backend.environment.includes("PORT=3000"));
});

test("public API artifacts do not advertise /metrics", () => {
  for (const relativePath of [
    "docs/API.md",
    "client/public/demo-assets/files/api-contract.md",
  ]) {
    assert.doesNotMatch(readRepositoryFile(relativePath), /\/metrics\b/i, relativePath);
  }
});

test("the example server configuration keeps metrics disabled by default", () => {
  assert.match(readRepositoryFile("server/.env.example"), /^METRICS_ENABLED=false$/m);
});
