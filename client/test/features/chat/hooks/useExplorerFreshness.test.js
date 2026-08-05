import assert from "node:assert/strict";
import test from "node:test";
import React, { act, forwardRef, useImperativeHandle } from "react";
import TestRenderer from "react-test-renderer";
import { useExplorerFreshness } from "../../../../src/features/chat/hooks/useExplorerFreshness.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class MockSocket {
  constructor() {
    this.handlers = new Map();
    this.offCalls = [];
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) || new Set();
    handlers.add(handler);
    this.handlers.set(event, handlers);
  }

  off(event, handler) {
    this.offCalls.push({ event, handler });
    this.handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) || []) {
      handler(payload);
    }
  }

  listenerCount(event) {
    return this.handlers.get(event)?.size || 0;
  }
}

const renderFreshnessHook = async (initialProps) => {
  const resultRef = React.createRef();

  const Harness = forwardRef((props, ref) => {
    const result = useExplorerFreshness(props);
    useImperativeHandle(ref, () => result, [result]);
    return null;
  });

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(Harness, { ...initialProps, ref: resultRef })
    );
  });

  return {
    getResult: () => resultRef.current,
    async rerender(nextProps) {
      await act(async () => {
        renderer.update(
          React.createElement(Harness, { ...nextProps, ref: resultRef })
        );
      });
    },
    async unmount() {
      await act(async () => {
        renderer.unmount();
      });
    },
  };
};

test("freshness resets when conversation scope changes and does not resurrect", async () => {
  const socket = new MockSocket();
  const hook = await renderFreshnessHook({
    conversationId: "conversation-a",
    type: "media",
    socket,
  });

  await act(async () => {
    socket.emit("getMessage", {
      conversationId: "conversation-a",
      attachments: [{ mimeType: "image/png" }],
    });
  });
  assert.equal(hook.getResult().hasNewItems, true);

  await hook.rerender({
    conversationId: "conversation-b",
    type: "media",
    socket,
  });
  assert.equal(hook.getResult().hasNewItems, false);
  assert.equal(socket.listenerCount("getMessage"), 1);

  await hook.rerender({
    conversationId: "conversation-a",
    type: "media",
    socket,
  });
  assert.equal(hook.getResult().hasNewItems, false);
  assert.equal(socket.listenerCount("getMessage"), 1);
  assert.equal(socket.offCalls.length, 2);

  await hook.unmount();
  assert.equal(socket.listenerCount("getMessage"), 0);
});

test("freshness matches each resource type and refresh clears the banner once", async () => {
  const cases = [
    ["media", { attachments: [{ mimeType: "video/mp4" }] }],
    ["files", { attachments: [{ mimeType: "application/pdf" }] }],
    ["links", { text: "Visit https://example.com" }],
  ];

  for (const [type, message] of cases) {
    const socket = new MockSocket();
    const hook = await renderFreshnessHook({
      conversationId: "conversation-a",
      type,
      socket,
    });

    await act(async () => {
      socket.emit("getMessage", {
        conversationId: "another-conversation",
        ...message,
      });
      socket.emit("getMessage", {
        conversationId: "conversation-a",
        text: null,
        attachments: null,
      });
    });
    assert.equal(hook.getResult().hasNewItems, false);

    await act(async () => {
      socket.emit("getMessage", {
        conversationId: "conversation-a",
        ...message,
      });
    });
    assert.equal(hook.getResult().hasNewItems, true);

    let refreshCalls = 0;
    await act(async () => {
      hook.getResult().refresh(() => {
        refreshCalls += 1;
      });
    });
    assert.equal(hook.getResult().hasNewItems, false);
    assert.equal(refreshCalls, 1);

    await act(async () => {
      for (const invalidCallback of [undefined, null, "not-a-function"]) {
        assert.doesNotThrow(() => hook.getResult().refresh(invalidCallback));
      }
    });
    assert.equal(refreshCalls, 1);

    await hook.unmount();
  }
});

test("freshness does not subscribe without a supported realtime scope", async () => {
  const socket = new MockSocket();
  const hook = await renderFreshnessHook({
    conversationId: "conversation-a",
    type: "commonGroups",
    socket,
  });

  assert.equal(socket.listenerCount("getMessage"), 0);

  await hook.rerender({ conversationId: null, type: "media", socket });
  assert.equal(socket.listenerCount("getMessage"), 0);

  await hook.rerender({
    conversationId: "conversation-a",
    type: "media",
    socket: null,
  });
  assert.equal(socket.listenerCount("getMessage"), 0);

  await hook.unmount();
});
