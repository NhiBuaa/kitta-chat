const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const YAML = require("yaml");

const repository = path.resolve(__dirname, "../../..");
const renderer = path.join(repository, "nginx", "docker-entrypoint.d", "10-render-k6-edge.sh");
const template = path.join(repository, "nginx", "nginx.conf");
const shell = "C:\\Program Files\\Git\\bin\\sh.exe";

const normalizeShellPath = (value) => value.replaceAll("\\", "/");

const runRenderer = ({
  target = "public-demo",
  upstream,
  allowTestUpstream,
} = {}) => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k6-112-render-"));
  const output = path.join(temporaryDirectory, "nginx.conf");
  const env = {
    PATH: process.env.PATH,
    K6_TARGET: target,
    K6_EDGE_CONFIG_TEMPLATE: normalizeShellPath(template),
    K6_EDGE_CONFIG_OUTPUT: normalizeShellPath(output),
    K6_EDGE_RENDER_ONLY: "true",
  };
  if (upstream !== undefined) env.BACKEND_UPSTREAM = upstream;
  if (allowTestUpstream !== undefined) {
    env.K6_EDGE_ALLOW_TEST_UPSTREAM = allowTestUpstream;
  }

  const result = spawnSync(shell, [normalizeShellPath(renderer)], {
    cwd: repository,
    env,
    encoding: "utf8",
  });
  const rendered = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : null;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return { ...result, rendered };
};

const combinedOutput = (result) => `${result.stdout || ""}\n${result.stderr || ""}`;

test("public-demo renderer accepts one canonical Railway private authority", () => {
  const result = runRenderer({ upstream: "backend.railway.internal:3000" });
  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.rendered, /upstream kittachat_backend\s*\{\s*server backend\.railway\.internal:3000;/);
  assert.doesNotMatch(result.rendered, /resolver\s+127\.0\.0\.11/);
  assert.match(result.rendered, /set \$k6_public_demo 1;/);
  assert.doesNotMatch(result.rendered, /__BACKEND_UPSTREAM__/);
});

test("public-demo renderer accepts .internal.test only through explicit test authority", () => {
  const denied = runRenderer({ upstream: "backend.internal.test:3000" });
  assert.notEqual(denied.status, 0);
  assert.match(combinedOutput(denied), /K6_EDGE_CONFIG_ERROR=TEST_AUTHORITY_REQUIRED/);

  const allowed = runRenderer({
    upstream: "backend.internal.test:3000",
    allowTestUpstream: "true",
  });
  assert.equal(allowed.status, 0, combinedOutput(allowed));
  assert.match(allowed.rendered, /upstream kittachat_backend\s*\{\s*server backend\.internal\.test:3000;/);
});

test("local Compose uses only the explicit local-compose adapter", () => {
  const accepted = runRenderer({ target: "local-compose", upstream: "backend:3000" });
  assert.equal(accepted.status, 0, combinedOutput(accepted));
  assert.match(accepted.rendered, /upstream kittachat_backend\s*\{\s*server backend:3000;/);
  assert.match(accepted.rendered, /set \$k6_public_demo 0;/);

  for (const upstream of [undefined, "localhost:3000", "backend.railway.internal:3000"]) {
    const rejected = runRenderer({ target: "local-compose", upstream });
    assert.notEqual(rejected.status, 0, `unexpected local adapter acceptance: ${upstream}`);
  }

  const compose = YAML.parse(fs.readFileSync(path.join(repository, "docker-compose.yml"), "utf8"));
  assert.deepEqual(
    compose.services.nginx.environment,
    ["K6_TARGET=local-compose", "BACKEND_UPSTREAM=backend:3000"],
  );
  const benchmarkCompose = YAML.parse(
    fs.readFileSync(path.join(repository, "docker-compose.k4.yml"), "utf8"),
  );
  assert.deepEqual(benchmarkCompose.services.nginx.environment, {
    K6_TARGET: "local-compose",
    BACKEND_UPSTREAM: "backend:3000",
  });
});

const invalidPublicAuthorities = [
  ["missing value", undefined],
  ["blank value", ""],
  ["URL scheme", "http://backend.railway.internal:3000"],
  ["implicit port", "backend.railway.internal"],
  ["alternate port", "backend.railway.internal:80"],
  ["localhost loopback", "localhost:3000"],
  ["IPv4 loopback", "127.0.0.1:3000"],
  ["IPv6 loopback", "[::1]:3000"],
  ["wildcard hostname", "*:3000"],
  ["wildcard address", "0.0.0.0:3000"],
  ["leading whitespace", " backend.railway.internal:3000"],
  ["embedded whitespace", "backend .railway.internal:3000"],
  ["userinfo", "user@backend.railway.internal:3000"],
  ["path", "backend.railway.internal:3000/path"],
  ["query", "backend.railway.internal:3000?x=1"],
  ["fragment", "backend.railway.internal:3000#fragment"],
  ["wrong private suffix", "backend.example.test:3000"],
  ["uppercase hostname", "Backend.railway.internal:3000"],
  ["empty DNS label", "backend..railway.internal:3000"],
  ["oversized DNS label", `${"a".repeat(64)}.railway.internal:3000`],
];

for (const [category, upstream] of invalidPublicAuthorities) {
  test(`public-demo renderer rejects ${category}`, () => {
    const result = runRenderer({ upstream });
    assert.notEqual(result.status, 0);
    assert.match(combinedOutput(result), /K6_EDGE_CONFIG_ERROR=/);
    assert.equal(result.rendered, null);
  });
}

test("renderer rejects unsupported targets and non-boolean test authority", () => {
  const unsupported = runRenderer({ target: "production", upstream: "backend:3000" });
  assert.notEqual(unsupported.status, 0);
  assert.match(combinedOutput(unsupported), /K6_EDGE_CONFIG_ERROR=UNSUPPORTED_TARGET/);

  const inherited = runRenderer({
    upstream: "backend.internal.test:3000",
    allowTestUpstream: "1",
  });
  assert.notEqual(inherited.status, 0);
  assert.match(combinedOutput(inherited), /K6_EDGE_CONFIG_ERROR=INVALID_TEST_AUTHORITY/);
});

test("nginx template renders the locked REST, auth, and Socket.IO header contract", () => {
  const source = fs.readFileSync(template, "utf8");
  assert.match(source, /proxy_set_header\s+Origin\s+\$http_origin;/g);
  assert.equal((source.match(/proxy_set_header\s+Origin\s+\$http_origin;/g) || []).length, 3);
  assert.doesNotMatch(source, /proxy_set_header\s+Accept\s+\$http_origin;/);
  assert.match(source, /proxy_set_header\s+Accept\s+\$http_accept;/);
  assert.match(source, /proxy_set_header\s+Upgrade\s+\$http_upgrade;/);
  assert.match(source, /proxy_set_header\s+Connection\s+\$connection_upgrade;/);
  assert.match(source, /proxy_buffering\s+off;/);
  assert.match(source, /proxy_read_timeout\s+86400s;/);
  assert.match(source, /proxy_send_timeout\s+86400s;/);
  for (const header of ["Host", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto"]) {
    assert.match(source, new RegExp(`proxy_set_header\\s+${header}\\s+`));
  }
});

test("nginx template fixes health, reserved, denied, and SPA precedence", () => {
  const source = fs.readFileSync(template, "utf8");
  assert.match(source, /location = \/healthz\s*\{[\s\S]*?default_type text\/plain;[\s\S]*?return 200 "OK";/);
  assert.match(source, /location = \/runtime-config\.json\s*\{/);
  assert.ok(source.includes("location ~ ^/(?:readyz|ops|metrics|backend-healthz)(?:/|$) {"));
  assert.match(source, /location = \/api\s*\{/);
  assert.match(source, /location = \/socket\.io\s*\{/);
  assert.match(source, /location \^~ \/api\/\s*\{/);
  assert.match(source, /location \^~ \/api\/auth\/\s*\{/);
  assert.match(source, /location \^~ \/socket\.io\/\s*\{/);
  assert.match(source, /try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(source, /error_page 404 = @edge_not_found;/);
  assert.match(source, /location @edge_not_found\s*\{\s*default_type text\/plain;\s*return 404 "Not Found";/);
  assert.match(source, /location = \/backend-healthz\s*\{\s*if \(\$k6_public_demo = 1\) \{ return 404; \}[\s\S]*?proxy_pass http:\/\/kittachat_backend\/healthz;/);
  assert.match(source, /location = \/readyz\s*\{\s*if \(\$k6_public_demo = 1\) \{ return 404; \}[\s\S]*?proxy_pass http:\/\/kittachat_backend;/);
  assert.match(source, /location = \/ops\s*\{\s*internal;[\s\S]*?proxy_pass http:\/\/kittachat_backend;/);
  assert.doesNotMatch(source, /proxy_pass[^;]*\/metrics/);
});

test("Docker packaging keeps BACKEND_UPSTREAM runtime-only", () => {
  const dockerfile = fs.readFileSync(path.join(repository, "nginx", "Dockerfile"), "utf8");
  assert.doesNotMatch(dockerfile, /ARG\s+BACKEND_UPSTREAM/);
  assert.match(dockerfile, /COPY nginx\/nginx\.conf \/etc\/nginx\/nginx\.conf/);
  assert.match(dockerfile, /COPY nginx\/nginx\.conf \/etc\/nginx\/k6\/nginx\.conf\.template/);
  assert.match(dockerfile, /COPY nginx\/docker-entrypoint\.d\/10-render-k6-edge\.sh/);
});

test("existing Socket.IO auth and event fixture digest remains unchanged", () => {
  const files = [
    "server/src/socket/socketEvents.js",
    "client/src/constants/socketEvents.js",
    "server/src/socket/index.js",
  ];
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    digest.update(`${file}\0`);
    const canonicalSource = fs
      .readFileSync(path.join(repository, file), "utf8")
      .replaceAll("\r\n", "\n");
    digest.update(canonicalSource);
    digest.update("\0");
  }
  assert.equal(
    digest.digest("hex"),
    "8cd09ab26143bff0190b9ca08492995db07248d286683cae0496de627617f2e8",
  );
});
