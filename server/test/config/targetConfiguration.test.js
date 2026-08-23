const assert = require("node:assert/strict");
const test = require("node:test");

const {
  validateTargetConfiguration,
} = require("../../src/config/targetConfiguration");

const capabilities = Object.freeze({
  directChat: true,
  groupChat: true,
  realtimeSidebar: true,
  calls: true,
  selfSignup: true,
  seededDemoAccounts: true,
  upload: false,
  recovery: false,
  googleLogin: false,
  metricsExport: false,
  issue61Measurement: false,
});

const validTarget = () => ({
  targetName: "public-demo",
  publicAppUrl: "https://kittachat.example.test",
  allowedBrowserOrigins: ["https://kittachat.example.test"],
  backendUpstream: "http://backend.internal.test:3000",
  capabilities: { ...capabilities },
  workerDependencyBindings: {
    imageWorker: ["mongo", "redis", "rabbitmq", "objectStorage"],
    auditWorker: ["rabbitmq"],
    notificationWorker: [],
  },
});

const syntheticTargetAuthority = Object.freeze({
  expectedPublicAppUrl: "https://kittachat.example.test",
  expectedBackendUpstream: "http://backend.internal.test:3000",
  allowSyntheticTestValues: true,
});

const validateSyntheticTargetConfiguration = (target) => (
  validateTargetConfiguration(target, syntheticTargetAuthority)
);

test("public-demo target configuration returns one normalized semantic contract", () => {
  const result = validateSyntheticTargetConfiguration(validTarget());

  assert.deepEqual(result, {
    targetName: "public-demo",
    publicAppUrl: "https://kittachat.example.test",
    allowedBrowserOrigins: ["https://kittachat.example.test"],
    backendUpstream: "http://backend.internal.test:3000",
    capabilities,
    workerDependencyBindings: {
      imageWorker: ["mongo", "redis", "rabbitmq", "objectStorage"],
      auditWorker: ["rabbitmq"],
      notificationWorker: [],
    },
    validationResult: { valid: true, issues: [] },
  });
});

test("target configuration rejects any target other than public-demo without fallback", () => {
  const target = validTarget();
  target.targetName = "production";

  const result = validateSyntheticTargetConfiguration(target);

  assert.equal(result.targetName, "production");
  assert.deepEqual(result.validationResult, {
    valid: false,
    issues: ["targetName must be exactly public-demo"],
  });
});

test("public-demo target rejects unsafe publicAppUrl values without substituting an origin", () => {
  const invalidValues = [
    undefined,
    null,
    "",
    " ",
    "not-a-url",
    "*",
    "$http_origin",
    "http://kittachat.example.test",
    "https://user:password@kittachat.example.test",
    "https://kittachat.example.test/api",
    "https://kittachat.example.test?mode=demo",
    "https://kittachat.example.test#demo",
    "https://*.example.test",
    "https://kittachat.example.test:444",
    "https://other.example.test",
    "https://evil.kittachat.example.test",
  ];

  for (const publicAppUrl of invalidValues) {
    const target = validTarget();
    target.publicAppUrl = publicAppUrl;

    const result = validateSyntheticTargetConfiguration(target);

    assert.equal(result.publicAppUrl, publicAppUrl);
    assert.equal(result.validationResult.valid, false, String(publicAppUrl));
    assert.notEqual(result.publicAppUrl, "http://localhost:5173");
    assert.notEqual(result.publicAppUrl, target.allowedBrowserOrigins[0]);
  }
});

test("public-demo target rejects loopback public origins even when the binding repeats them", () => {
  for (const publicAppUrl of [
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
  ]) {
    const target = validTarget();
    target.publicAppUrl = publicAppUrl;
    target.allowedBrowserOrigins = [publicAppUrl];
    target.backendUpstream = "http://backend.railway.internal:3000";

    const result = validateTargetConfiguration(target, {
      expectedPublicAppUrl: publicAppUrl,
      expectedBackendUpstream: target.backendUpstream,
    });

    assert.equal(result.validationResult.valid, false, publicAppUrl);
    assert.ok(result.validationResult.issues.includes(
      "trusted target binding must provide exact public and backend origins",
    ));
    assert.ok(result.validationResult.issues.includes(
      "publicAppUrl must be the exact bare HTTPS origin in allowedBrowserOrigins",
    ));
  }
});

test("public-demo target rejects unsafe browser origin allowlists without fallback", () => {
  const invalidValues = [
    undefined,
    null,
    "https://kittachat.example.test",
    [],
    [""],
    [" "],
    ["*"],
    ["$http_origin"],
    ["http://kittachat.example.test"],
    ["https://kittachat.example.test:444"],
    ["https://other.example.test"],
    ["https://evil.kittachat.example.test"],
    ["https://kittachat.example.test", "https://kittachat.example.test"],
    ["https://kittachat.example.test", "https://other.example.test"],
  ];

  for (const allowedBrowserOrigins of invalidValues) {
    const target = validTarget();
    target.allowedBrowserOrigins = allowedBrowserOrigins;

    const result = validateSyntheticTargetConfiguration(target);

    assert.deepEqual(result.allowedBrowserOrigins, allowedBrowserOrigins);
    assert.equal(result.validationResult.valid, false, JSON.stringify(allowedBrowserOrigins));
    assert.ok(
      result.validationResult.issues.includes(
        "allowedBrowserOrigins must contain publicAppUrl exactly once",
      ),
    );
  }
});

test("public-demo target rejects unsafe backend upstream origins without fallback", () => {
  const invalidValues = [
    undefined,
    null,
    "",
    "backend.internal.test:3000",
    "http://user:password@backend.internal.test:3000",
    "http://backend.internal.test:3000/api",
    "http://backend.internal.test:3000?mode=demo",
    "http://backend.internal.test:3000#demo",
    "http://*.internal.test:3000",
    "http://backend.internal.test:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://kittachat.example.test:3000",
    "https://attacker.example.com:3000",
    "http://203.0.113.10:3000",
    "http://backend.railway.app:3000",
    "http://railway.internal.evil.test:3000",
    "https://kittachat.example.test",
  ];

  for (const backendUpstream of invalidValues) {
    const target = validTarget();
    target.backendUpstream = backendUpstream;

    const result = validateSyntheticTargetConfiguration(target);

    assert.equal(result.backendUpstream, backendUpstream);
    assert.equal(result.validationResult.valid, false, String(backendUpstream));
    assert.ok(
      result.validationResult.issues.includes(
        "backendUpstream must be a private bare HTTP(S) origin on port 3000",
      ),
    );
  }
});

test("public-demo target accepts the exact Railway private origin supplied by the target adapter", () => {
  const target = validTarget();
  target.backendUpstream = "http://backend.railway.internal:3000";

  const result = validateTargetConfiguration(target, {
    expectedPublicAppUrl: "https://kittachat.example.test",
    expectedBackendUpstream: "http://backend.railway.internal:3000",
  });

  assert.equal(result.validationResult.valid, true);
  assert.equal(result.backendUpstream, "http://backend.railway.internal:3000");
});

test("public-demo target rejects matching evil public origins outside the trusted target binding", () => {
  const target = validTarget();
  target.publicAppUrl = "https://evil.kittachat.example.test";
  target.allowedBrowserOrigins = ["https://evil.kittachat.example.test"];

  const result = validateSyntheticTargetConfiguration(target);

  assert.equal(result.validationResult.valid, false);
  assert.ok(result.validationResult.issues.includes(
    "publicAppUrl must match the trusted target binding",
  ));
});

test("production target authority rejects test-only private upstream namespaces", () => {
  const result = validateTargetConfiguration(validTarget(), {
    expectedPublicAppUrl: "https://kittachat.example.test",
    expectedBackendUpstream: "http://backend.internal.test:3000",
  });

  assert.equal(result.validationResult.valid, false);
  assert.ok(result.validationResult.issues.includes(
    "backendUpstream must be the trusted private Railway origin on port 3000",
  ));
});

test("synthetic private upstreams require an own boolean true test authority", () => {
  const baseAuthority = {
    expectedPublicAppUrl: "https://kittachat.example.test",
    expectedBackendUpstream: "http://backend.internal.test:3000",
  };
  const inheritedAuthority = Object.assign(
    Object.create({ allowSyntheticTestValues: true }),
    baseAuthority,
  );
  const invalidAuthorities = [
    { ...baseAuthority, allowSyntheticTestValues: false },
    { ...baseAuthority, allowSyntheticTestValues: "false" },
    { ...baseAuthority, allowSyntheticTestValues: 1 },
    { ...baseAuthority, allowSyntheticTestValues: {} },
    inheritedAuthority,
  ];

  for (const authority of invalidAuthorities) {
    const result = validateTargetConfiguration(validTarget(), authority);

    assert.equal(result.validationResult.valid, false);
    assert.ok(result.validationResult.issues.includes(
      "trusted target binding must provide exact public and backend origins",
    ));
  }
});

test("target configuration fails closed without trusted target binding input", () => {
  const result = validateTargetConfiguration(validTarget());

  assert.equal(result.validationResult.valid, false);
  assert.ok(result.validationResult.issues.includes(
    "trusted target binding must provide exact public and backend origins",
  ));
});

test("target configuration accepts only the exact boolean capability contract", () => {
  const invalidValues = [undefined, null, {}, { ...capabilities, experimental: false }];

  for (const key of Object.keys(capabilities)) {
    const missing = { ...capabilities };
    delete missing[key];
    invalidValues.push(missing, { ...capabilities, [key]: "false" });
  }

  for (const capabilityValue of invalidValues) {
    const target = validTarget();
    target.capabilities = capabilityValue;

    const result = validateSyntheticTargetConfiguration(target);

    assert.equal(result.validationResult.valid, false, JSON.stringify(capabilityValue));
    assert.ok(
      result.validationResult.issues.includes(
        "capabilities must contain only the required boolean keys",
      ),
    );
  }
});

test("public-demo target enforces core-enabled and fixed-disabled capability semantics", () => {
  const invalidCapabilities = [
    { ...capabilities, directChat: false },
    { ...capabilities, groupChat: false },
    { ...capabilities, realtimeSidebar: false },
    { ...capabilities, selfSignup: false },
    { ...capabilities, seededDemoAccounts: false },
    { ...capabilities, recovery: true },
    { ...capabilities, googleLogin: true },
    { ...capabilities, metricsExport: true },
    { ...capabilities, issue61Measurement: true },
  ];

  for (const capabilityValue of invalidCapabilities) {
    const target = validTarget();
    target.capabilities = capabilityValue;

    const result = validateSyntheticTargetConfiguration(target);

    assert.equal(result.validationResult.valid, false, JSON.stringify(capabilityValue));
    assert.ok(
      result.validationResult.issues.includes(
        "capabilities violate the public-demo fixed capability policy",
      ),
    );
  }
});

test("target configuration rejects incomplete or over-privileged worker bindings", () => {
  const validBindings = validTarget().workerDependencyBindings;
  const invalidValues = [
    undefined,
    null,
    {},
    { ...validBindings, extraWorker: [] },
    { ...validBindings, imageWorker: ["mongo", "redis", "rabbitmq"] },
    { ...validBindings, imageWorker: ["mongo", "redis", "rabbitmq", "objectStorage", "redis"] },
    { ...validBindings, imageWorker: ["mongo", "redis", "rabbitmq", "objectStorage", "email"] },
    { ...validBindings, auditWorker: [] },
    { ...validBindings, auditWorker: ["rabbitmq", "rabbitmq"] },
    { ...validBindings, auditWorker: ["rabbitmq", "mongo"] },
    { ...validBindings, notificationWorker: ["rabbitmq"] },
    { ...validBindings, imageWorker: "mongo" },
  ];

  for (const workerDependencyBindings of invalidValues) {
    const target = validTarget();
    target.workerDependencyBindings = workerDependencyBindings;

    const result = validateSyntheticTargetConfiguration(target);

    assert.equal(result.validationResult.valid, false, JSON.stringify(workerDependencyBindings));
    assert.ok(
      result.validationResult.issues.includes(
        "workerDependencyBindings must match the approved service dependency matrix",
      ),
    );
  }
});

test("target configuration reports an absent or malformed document instead of throwing", () => {
  for (const input of [undefined, null, "", []]) {
    const result = validateSyntheticTargetConfiguration(input);

    assert.equal(result.validationResult.valid, false);
    assert.ok(
      result.validationResult.issues.includes(
        "target configuration must be an object",
      ),
    );
    assert.equal(result.publicAppUrl, undefined);
    assert.equal(result.allowedBrowserOrigins, undefined);
  }
});

test("target configuration rejects unknown top-level deployment fields", () => {
  const target = {
    ...validTarget(),
    railwayPrivateHostname: "backend.railway.internal",
  };

  const result = validateSyntheticTargetConfiguration(target);

  assert.equal(result.validationResult.valid, false);
  assert.ok(
    result.validationResult.issues.includes(
      "target configuration must contain only the required fields",
    ),
  );
  assert.equal(Object.hasOwn(result, "railwayPrivateHostname"), false);
});
