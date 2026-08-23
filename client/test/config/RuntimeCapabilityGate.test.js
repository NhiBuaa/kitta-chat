import assert from "node:assert/strict";
import test from "node:test";

import React, { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";

import { RuntimeConfigContext } from "../../src/config/RuntimeConfigProvider.js";
import {
  RuntimeCapabilityGate,
  RuntimeCapabilityRoute,
  RuntimeConfigBoundary,
} from "../../src/config/RuntimeCapabilityGate.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderWithRuntime = async (runtime, child) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(
      RuntimeConfigContext.Provider,
      { value: runtime },
      child,
    ));
  });
  return renderer;
};

test("runtime boundary never renders application controls while loading or error", async () => {
  for (const status of ["loading", "error"]) {
    const renderer = await renderWithRuntime(
      {
        status,
        capabilities: { recovery: false },
        errorCode: "provider-secret-detail",
      },
      createElement(
        RuntimeConfigBoundary,
        null,
        createElement("button", { id: "application-control" }, "Control"),
      ),
    );

    assert.equal(renderer.root.findAllByProps({ id: "application-control" }).length, 0);
    assert.equal(JSON.stringify(renderer.toJSON()).includes("provider-secret-detail"), false);
    await act(async () => renderer.unmount());
  }
});

test("capability gate renders only an explicitly enabled ready capability", async () => {
  for (const runtime of [
    { status: "loading", capabilities: { recovery: true } },
    { status: "error", capabilities: { recovery: true } },
    { status: "ready", capabilities: { recovery: false } },
    { status: "ready", capabilities: {} },
  ]) {
    const renderer = await renderWithRuntime(
      runtime,
      createElement(
        RuntimeCapabilityGate,
        { capability: "recovery" },
        createElement("a", { id: "recovery-control" }, "Recovery"),
      ),
    );
    assert.equal(renderer.root.findAllByProps({ id: "recovery-control" }).length, 0);
    await act(async () => renderer.unmount());
  }

  const enabled = await renderWithRuntime(
    { status: "ready", capabilities: { recovery: true } },
    createElement(
      RuntimeCapabilityGate,
      { capability: "recovery" },
      createElement("a", { id: "recovery-control" }, "Recovery"),
    ),
  );
  assert.equal(enabled.root.findAllByProps({ id: "recovery-control" }).length, 1);
  await act(async () => enabled.unmount());
});

test("capability route renders a safe unavailable state for direct disabled navigation", async () => {
  const disabled = await renderWithRuntime(
    { status: "ready", capabilities: { recovery: false } },
    createElement(
      RuntimeCapabilityRoute,
      { capability: "recovery" },
      createElement("main", { id: "recovery-route" }, "Recovery"),
    ),
  );
  assert.equal(disabled.root.findAllByProps({ id: "recovery-route" }).length, 0);
  assert.equal(disabled.root.findAllByProps({ "data-capability-unavailable": "recovery" }).length, 1);
  assert.equal(JSON.stringify(disabled.toJSON()).includes("provider"), false);
  await act(async () => disabled.unmount());

  const enabled = await renderWithRuntime(
    { status: "ready", capabilities: { recovery: true } },
    createElement(
      RuntimeCapabilityRoute,
      { capability: "recovery" },
      createElement("main", { id: "recovery-route" }, "Recovery"),
    ),
  );
  assert.equal(enabled.root.findAllByProps({ id: "recovery-route" }).length, 1);
  await act(async () => enabled.unmount());
});
