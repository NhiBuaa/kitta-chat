import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RuntimeConfigLoadError,
  RuntimeConfigValidationError,
  createRuntimeConfigLoaderForTarget,
  loadRuntimeConfig,
  parseRuntimeConfigDocument,
} from "../../src/config/runtimeConfig.js";

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

const validRuntimeDocument = () => ({
  schemaVersion: 1,
  target: "public-demo",
  capabilities: { ...capabilities },
  webrtc: {
    iceServers: [
      { urls: "stun:stun.example.test:3478" },
      { urls: ["stun:secondary.example.test:3478"] },
    ],
  },
});

test("runtime config parser accepts and normalizes the exact public-demo document", () => {
  const result = parseRuntimeConfigDocument(validRuntimeDocument());

  assert.deepEqual(result, {
    schemaVersion: 1,
    target: "public-demo",
    capabilities,
    webrtc: {
      iceServers: [
        { urls: "stun:stun.example.test:3478" },
        { urls: ["stun:secondary.example.test:3478"] },
      ],
    },
  });
});

test("runtime config parser rejects absent, stale, target-mismatched, or unknown envelopes", () => {
  const invalidDocuments = [
    undefined,
    null,
    "",
    [],
    {},
    { ...validRuntimeDocument(), schemaVersion: 0 },
    { ...validRuntimeDocument(), schemaVersion: 2 },
    { ...validRuntimeDocument(), target: "production" },
    { ...validRuntimeDocument(), generatedHostname: "demo.example.test" },
  ];

  for (const document of invalidDocuments) {
    assert.throws(
      () => parseRuntimeConfigDocument(document),
      (error) => error instanceof RuntimeConfigValidationError
        && error.issues.length > 0,
      JSON.stringify(document),
    );
  }
});

test("runtime config parser rejects missing, non-boolean, or unknown capabilities", () => {
  const invalidValues = [undefined, null, [], {}, { ...capabilities, experimental: false }];

  for (const key of Object.keys(capabilities)) {
    const missing = { ...capabilities };
    delete missing[key];
    invalidValues.push(missing, { ...capabilities, [key]: "false" });
  }

  for (const capabilityValue of invalidValues) {
    const document = validRuntimeDocument();
    document.capabilities = capabilityValue;

    assert.throws(
      () => parseRuntimeConfigDocument(document),
      (error) => error instanceof RuntimeConfigValidationError
        && error.issues.includes(
          "capabilities must contain only the required boolean keys",
        ),
      JSON.stringify(capabilityValue),
    );
  }
});

test("runtime config parser enforces core-enabled and fixed-disabled public-demo semantics", () => {
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
    const document = validRuntimeDocument();
    document.capabilities = capabilityValue;

    assert.throws(
      () => parseRuntimeConfigDocument(document),
      (error) => error instanceof RuntimeConfigValidationError
        && error.issues.includes(
          "capabilities violate the public-demo runtime policy",
        ),
      JSON.stringify(capabilityValue),
    );
  }

  const uploadFixture = validRuntimeDocument();
  uploadFixture.capabilities.upload = true;
  assert.equal(
    parseRuntimeConfigDocument(uploadFixture).capabilities.upload,
    true,
  );
});

test("runtime target loader preserves the legacy local application without fetching demo config", async () => {
  let publicDemoLoads = 0;
  const load = createRuntimeConfigLoaderForTarget({
    target: undefined,
    publicDemoLoad: async () => {
      publicDemoLoads += 1;
      return validRuntimeDocument();
    },
  });

  const result = await load();

  assert.equal(publicDemoLoads, 0);
  assert.equal(result.target, "legacy-local");
  assert.deepEqual(result.capabilities, {
    directChat: true,
    groupChat: true,
    realtimeSidebar: true,
    calls: true,
    selfSignup: true,
    seededDemoAccounts: false,
    upload: true,
    recovery: true,
    googleLogin: true,
    metricsExport: false,
    issue61Measurement: false,
  });
  assert.deepEqual(result.webrtc, { iceServers: [] });
});

test("runtime target loader uses network configuration only for the exact public-demo target", async () => {
  const expected = validRuntimeDocument();
  const publicDemoLoad = async () => expected;

  assert.equal(
    await createRuntimeConfigLoaderForTarget({
      target: "public-demo",
      publicDemoLoad,
    })(),
    expected,
  );

  await assert.rejects(
    createRuntimeConfigLoaderForTarget({
      target: "production",
      publicDemoLoad,
    })(),
    (error) => error instanceof RuntimeConfigLoadError
      && error.code === "invalid-target",
  );
});

test("runtime config parser accepts only non-secret ICE URL metadata", () => {
  const invalidValues = [
    undefined,
    null,
    [],
    {},
    { iceServers: null },
    { iceServers: {} },
    { iceServers: [null] },
    { iceServers: ["stun:stun.example.test:3478"] },
    { iceServers: [{}] },
    { iceServers: [{ urls: "" }] },
    { iceServers: [{ urls: [] }] },
    { iceServers: [{ urls: ["stun:stun.example.test:3478", ""] }] },
    { iceServers: [{ urls: "https://stun.example.test" }] },
    { iceServers: [{ urls: "turn:user:secret@turn.example.test:3478" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478?credential=long-lived-secret" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478?transport=udp&token=super-secret" }] },
    { iceServers: [{ urls: "turn:%75ser%40turn.example.test:3478" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478/credential" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478#credential" }] },
    { iceServers: [{ urls: "stun:stun.example.test:3478?transport=udp" }] },
    { iceServers: [{ urls: "turn:turn.example.test:70000" }] },
    { iceServers: [{ urls: "stun:stun.example.test:3478", username: "demo" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478", credential: "secret" }] },
    { iceServers: [{ urls: "turn:turn.example.test:3478", token: "secret" }] },
    { iceServers: [], provider: "example" },
  ];

  for (const webrtc of invalidValues) {
    const document = validRuntimeDocument();
    document.webrtc = webrtc;

    assert.throws(
      () => parseRuntimeConfigDocument(document),
      (error) => error instanceof RuntimeConfigValidationError
        && error.issues.includes(
          "webrtc must contain only non-secret ICE server URL metadata",
        ),
      JSON.stringify(webrtc),
    );
  }
});

test("runtime config parser accepts only the safe TURN transport query", () => {
  for (const url of [
    "turn:turn.example.test:3478?transport=udp",
    "turns:turn.example.test:5349?transport=tcp",
  ]) {
    const document = validRuntimeDocument();
    document.webrtc = { iceServers: [{ urls: url }] };
    assert.equal(
      parseRuntimeConfigDocument(document).webrtc.iceServers[0].urls,
      url,
    );
  }
});

test("runtime config loader fetches the same-origin document without cache reuse", async () => {
  const requests = [];
  const expected = validRuntimeDocument();
  const fetchImpl = async (...args) => {
    requests.push(args);
    return {
      ok: true,
      json: async () => expected,
    };
  };

  const result = await loadRuntimeConfig({ fetchImpl });

  assert.deepEqual(requests, [[
    "/runtime-config.json",
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  ]]);
  assert.deepEqual(result, expected);
  assert.notEqual(result, expected);
});

test("runtime config loader maps unavailable, malformed, and invalid documents to safe errors", async () => {
  let parsedErrorBody = false;
  const cases = [
    {
      code: "unavailable",
      fetchImpl: async () => {
        throw new Error("provider detail must not escape");
      },
    },
    {
      code: "unavailable",
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        json: async () => {
          parsedErrorBody = true;
          return { secret: "must-not-be-read" };
        },
      }),
    },
    {
      code: "invalid-response",
      fetchImpl: async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("provider response detail");
        },
      }),
    },
    {
      code: "invalid-document",
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    },
  ];

  for (const fixture of cases) {
    await assert.rejects(
      loadRuntimeConfig({ fetchImpl: fixture.fetchImpl }),
      (error) => error instanceof RuntimeConfigLoadError
        && error.code === fixture.code
        && !error.message.includes("provider"),
    );
  }

  assert.equal(parsedErrorBody, false);
});

test("committed all-disabled runtime document fails closed before application mount", async () => {
  const raw = await readFile(
    new URL("../../public/runtime-config.json", import.meta.url),
    "utf8",
  );

  assert.throws(
    () => parseRuntimeConfigDocument(JSON.parse(raw)),
    (error) => error instanceof RuntimeConfigValidationError
      && error.issues.includes("capabilities violate the public-demo runtime policy"),
  );
});

export { capabilities, validRuntimeDocument };
