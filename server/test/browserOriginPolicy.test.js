const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BrowserOriginConfigError,
  parseBrowserOriginPolicy,
} = require("../src/config/browserOriginPolicy");

test("browser origin policy allows only configured exact canonical origins", () => {
  const policy = parseBrowserOriginPolicy({
    rawOrigins: "http://localhost:5173, https://app.example.test/,https://app.example.test",
    environment: "production",
  });

  assert.deepEqual(policy.allowedOrigins, ["http://localhost:5173", "https://app.example.test"]);
  assert.equal(policy.isAllowedBrowserOrigin("http://localhost:5173"), true);
  assert.equal(policy.isAllowedBrowserOrigin("https://app.example.test"), true);
  assert.equal(policy.isAllowedBrowserOrigin("https://evilapp.example.test"), false);
  assert.equal(policy.isAllowedBrowserOrigin("https://app.example.test.evil.test"), false);
  assert.equal(policy.isRequestOriginAllowed(undefined), true);
  assert.equal(policy.isRequestOriginAllowed(""), false);
});

test("browser origin policy rejects missing non-development and malformed configuration", () => {
  assert.throws(
    () => parseBrowserOriginPolicy({ rawOrigins: undefined, environment: "production" }),
    BrowserOriginConfigError,
  );
  assert.throws(
    () => parseBrowserOriginPolicy({ rawOrigins: "https://app.example.test/path", environment: "production" }),
    BrowserOriginConfigError,
  );
  assert.throws(
    () => parseBrowserOriginPolicy({ rawOrigins: "ftp://app.example.test", environment: "production" }),
    BrowserOriginConfigError,
  );
  assert.throws(
    () => parseBrowserOriginPolicy({ rawOrigins: "https://user:pass@app.example.test", environment: "production" }),
    BrowserOriginConfigError,
  );
});

test("development and test without an allowlist fail closed without reflected-origin fallback", () => {
  const policy = parseBrowserOriginPolicy({ rawOrigins: undefined, environment: "test" });

  assert.deepEqual(policy.allowedOrigins, []);
  assert.equal(policy.isAllowedBrowserOrigin("http://localhost:5173"), false);
  assert.equal(policy.isRequestOriginAllowed(undefined), true);
});
