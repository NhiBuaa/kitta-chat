const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const nginxConfig = fs.readFileSync(
  path.join(__dirname, "..", "..", "nginx", "nginx.conf"),
  "utf8",
);

test("nginx logs only redacted reset URLs and sends no-referrer", () => {
  assert.match(nginxConfig, /\$request_method \$safe_request_uri \$server_protocol/);
  assert.match(nginxConfig, /\$safe_referer/);
  assert.match(nginxConfig, /~\^\/reset-password\/\[\^\/\]\+\/\[\^\/\]\+\$ \/reset-password\/\[REDACTED\]/);
  assert.match(nginxConfig, /~\^\/api\/auth\/reset-password\/\[\^\/\]\+\/\[\^\/\]\+\$ \/api\/auth\/reset-password\/\[REDACTED\]/);
  assert.match(nginxConfig, /Referrer-Policy\s+"no-referrer"/);
  assert.doesNotMatch(nginxConfig, /"\$request" \$status/);
});
