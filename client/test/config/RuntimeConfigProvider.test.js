import assert from "node:assert/strict";
import test from "node:test";

import React, { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";

import {
  RuntimeConfigProvider,
  useRuntimeConfig,
} from "../../src/config/RuntimeConfigProvider.js";
import { RuntimeConfigBoundary } from "../../src/config/RuntimeCapabilityGate.js";
import { loadRuntimeConfig } from "../../src/config/runtimeConfig.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const readyConfig = () => ({
  schemaVersion: 1,
  target: "public-demo",
  capabilities: {
    directChat: true,
    groupChat: true,
    realtimeSidebar: true,
    calls: true,
    selfSignup: true,
    seededDemoAccounts: true,
    upload: true,
    recovery: false,
    googleLogin: false,
    metricsExport: false,
    issue61Measurement: false,
  },
  webrtc: { iceServers: [] },
});

const Probe = () => {
  const runtime = useRuntimeConfig();
  return createElement(
    "div",
    { "data-status": runtime.status },
    runtime.capabilities.upload
      ? createElement("button", { id: "upload-control" }, "Upload")
      : null,
  );
};

test("runtime config provider keeps optional controls hidden until ready", async () => {
  let resolveConfig;
  const load = () => new Promise((resolve) => {
    resolveConfig = resolve;
  });
  let renderer;

  await act(async () => {
    renderer = TestRenderer.create(createElement(
      RuntimeConfigProvider,
      { load },
      createElement(Probe),
    ));
  });

  assert.equal(renderer.root.findByType("div").props["data-status"], "loading");
  assert.equal(renderer.root.findAllByProps({ id: "upload-control" }).length, 0);

  await act(async () => {
    resolveConfig(readyConfig());
    await Promise.resolve();
  });

  assert.equal(renderer.root.findByType("div").props["data-status"], "ready");
  assert.equal(renderer.root.findAllByProps({ id: "upload-control" }).length, 1);

  await act(async () => renderer.unmount());
});

test("runtime config provider blocks application mount for an all-disabled core document", async () => {
  const allDisabled = readyConfig();
  allDisabled.capabilities = Object.fromEntries(
    Object.keys(allDisabled.capabilities).map((key) => [key, false]),
  );
  const load = () => loadRuntimeConfig({
    fetchImpl: async () => ({ ok: true, json: async () => allDisabled }),
  });
  let renderer;

  await act(async () => {
    renderer = TestRenderer.create(createElement(
      RuntimeConfigProvider,
      { load },
      createElement(
        RuntimeConfigBoundary,
        null,
        createElement("main", { id: "application" }, "Application"),
      ),
    ));
    await Promise.resolve();
  });

  assert.equal(renderer.root.findAllByProps({ id: "application" }).length, 0);
  assert.equal(
    renderer.root.findAllByProps({ "data-runtime-config-state": "error" }).length,
    1,
  );
  await act(async () => renderer.unmount());
});

test("runtime config provider reaches the application for the ordinary local target", async () => {
  let renderer;

  await act(async () => {
    renderer = TestRenderer.create(createElement(
      RuntimeConfigProvider,
      { target: undefined },
      createElement(
        RuntimeConfigBoundary,
        null,
        createElement("main", { id: "legacy-application" }, "Application"),
      ),
    ));
    await Promise.resolve();
  });

  assert.equal(renderer.root.findAllByProps({ id: "legacy-application" }).length, 1);
  assert.equal(
    renderer.root.findAllByProps({ "data-runtime-config-state": "error" }).length,
    0,
  );
  await act(async () => renderer.unmount());
});
