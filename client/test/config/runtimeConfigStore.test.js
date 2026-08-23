import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeConfigStore } from "../../src/config/runtimeConfigStore.js";

const capabilities = {
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
};

const runtimeConfig = () => ({
  schemaVersion: 1,
  target: "public-demo",
  capabilities: { ...capabilities },
  webrtc: { iceServers: [{ urls: "stun:stun.example.test:3478" }] },
});

const allCapabilitiesDisabled = (value) => Object.values(value).every(
  (enabled) => enabled === false,
);

test("runtime config store transitions from fail-closed loading to ready", async () => {
  const expected = runtimeConfig();
  const store = createRuntimeConfigStore({ load: async () => expected });

  assert.equal(store.getSnapshot().status, "loading");
  assert.deepEqual(store.getSnapshot().capabilities, Object.fromEntries(
    Object.keys(capabilities).map((key) => [key, false]),
  ));
  assert.equal(allCapabilitiesDisabled(store.getSnapshot().capabilities), true);
  assert.deepEqual(store.getSnapshot().webrtc, { iceServers: [] });

  await store.reload();

  assert.deepEqual(store.getSnapshot(), {
    status: "ready",
    capabilities,
    webrtc: expected.webrtc,
    errorCode: null,
  });
});

test("runtime config store clears prior capabilities during a failed reload", async () => {
  let invocation = 0;
  const enabled = runtimeConfig();
  enabled.capabilities.recovery = true;
  const store = createRuntimeConfigStore({
    load: async () => {
      invocation += 1;
      if (invocation === 1) return enabled;
      throw Object.assign(new Error("sensitive detail"), { code: "invalid-document" });
    },
  });

  await store.reload();
  assert.equal(store.getSnapshot().capabilities.recovery, true);

  const reload = store.reload();
  assert.equal(store.getSnapshot().status, "loading");
  assert.equal(allCapabilitiesDisabled(store.getSnapshot().capabilities), true);
  await reload;

  assert.deepEqual(store.getSnapshot(), {
    status: "error",
    capabilities: Object.fromEntries(Object.keys(capabilities).map((key) => [key, false])),
    webrtc: { iceServers: [] },
    errorCode: "invalid-document",
  });
});

test("runtime config store ignores stale responses and notifies only committed state", async () => {
  const pending = [];
  const store = createRuntimeConfigStore({
    load: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  const observations = [];
  const unsubscribe = store.subscribe(() => {
    observations.push(store.getSnapshot());
  });

  const firstReload = store.reload();
  const secondReload = store.reload();
  const newest = runtimeConfig();
  newest.capabilities.recovery = true;
  pending[1].resolve(newest);
  await secondReload;

  const stale = runtimeConfig();
  stale.capabilities.upload = true;
  pending[0].resolve(stale);
  await firstReload;

  assert.equal(store.getSnapshot().status, "ready");
  assert.equal(store.getSnapshot().capabilities.recovery, true);
  assert.equal(store.getSnapshot().capabilities.upload, false);
  assert.deepEqual(observations.map(({ status }) => status), [
    "loading",
    "loading",
    "ready",
  ]);

  unsubscribe();
});

test("runtime config store does not commit a response after the consumer cancels", async () => {
  let resolveLoad;
  const store = createRuntimeConfigStore({
    load: () => new Promise((resolve) => {
      resolveLoad = resolve;
    }),
  });
  const observations = [];
  const unsubscribe = store.subscribe(() => observations.push(store.getSnapshot().status));

  const reload = store.reload();
  store.cancelPending();
  unsubscribe();
  resolveLoad(runtimeConfig());
  await reload;

  assert.equal(store.getSnapshot().status, "loading");
  assert.equal(allCapabilitiesDisabled(store.getSnapshot().capabilities), true);
  assert.deepEqual(observations, ["loading"]);
});

export { allCapabilitiesDisabled, runtimeConfig };
