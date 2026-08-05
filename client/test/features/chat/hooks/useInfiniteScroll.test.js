import assert from "node:assert/strict";
import test from "node:test";
import React, {
  Suspense,
  act,
  forwardRef,
  useImperativeHandle,
} from "react";
import TestRenderer from "react-test-renderer";
import { useInfiniteScroll } from "../../../../src/features/chat/hooks/useInfiniteScroll.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalIntersectionObserver = globalThis.IntersectionObserver;

test.afterEach(() => {
  if (originalIntersectionObserver === undefined) {
    delete globalThis.IntersectionObserver;
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});

class MockIntersectionObserver {
  static instances = [];

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.disconnectCalls = 0;
    this.observedTargets = [];
    MockIntersectionObserver.instances.push(this);
  }

  observe(target) {
    this.observedTargets.push(target);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }

  triggerIntersect(isIntersecting) {
    this.callback([{ isIntersecting }]);
  }
}

const renderInfiniteScrollHook = async (initialProps) => {
  const resultRef = React.createRef();
  const pendingRender = new Promise(() => {});

  const Harness = forwardRef((props, ref) => {
    const { suspend, ...hookProps } = props;
    const sentinelRef = useInfiniteScroll(hookProps);
    useImperativeHandle(ref, () => ({ sentinelRef }), [sentinelRef]);
    if (suspend) throw pendingRender;
    return null;
  });

  const renderHarness = (props) =>
    React.createElement(
      Suspense,
      { fallback: null },
      React.createElement(Harness, { ...props, ref: resultRef })
    );

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(renderHarness(initialProps));
  });

  const update = (nextProps) => {
    renderer.update(renderHarness(nextProps));
  };

  return {
    attachSentinel(node) {
      resultRef.current.sentinelRef(node);
    },
    update,
    async rerender(nextProps) {
      await act(async () => update(nextProps));
    },
    async unmount() {
      await act(async () => renderer.unmount());
    },
  };
};

test("infinite scroll publishes a new callback only after its render commits", async () => {
  MockIntersectionObserver.instances = [];
  globalThis.IntersectionObserver = MockIntersectionObserver;
  const calls = [];
  const rootRef = { current: { id: "root" } };
  const firstProps = {
    enabled: true,
    hasMore: true,
    isFetching: false,
    onLoadMore: () => calls.push("first"),
    rootRef,
  };
  const secondProps = {
    ...firstProps,
    onLoadMore: () => calls.push("second"),
  };
  const hook = await renderInfiniteScrollHook(firstProps);
  const sentinel = { id: "sentinel", closest: () => null, parentElement: null };

  await act(async () => hook.attachSentinel(sentinel));
  const observer = MockIntersectionObserver.instances[0];

  await hook.rerender({ ...secondProps, suspend: true });
  observer.triggerIntersect(true);
  assert.deepEqual(calls, ["first"]);

  observer.triggerIntersect(true);
  assert.deepEqual(calls, ["first"]);

  await hook.rerender(secondProps);
  await hook.rerender({ ...secondProps, isFetching: true });
  await hook.rerender({ ...secondProps, isFetching: false });
  observer.triggerIntersect(true);
  assert.deepEqual(calls, ["first", "second"]);

  await hook.unmount();
  assert.equal(observer.disconnectCalls, 1);
});

test("infinite scroll observes only enabled pages with more data and resolves its root", async () => {
  MockIntersectionObserver.instances = [];
  globalThis.IntersectionObserver = MockIntersectionObserver;
  const fallbackRoot = { id: "fallback-root" };
  const sentinel = {
    id: "sentinel",
    closest: () => fallbackRoot,
    parentElement: null,
  };
  const baseProps = {
    enabled: false,
    hasMore: true,
    isFetching: false,
    onLoadMore: () => {},
    rootRef: { current: null },
  };
  const hook = await renderInfiniteScrollHook(baseProps);

  assert.equal(MockIntersectionObserver.instances.length, 0);
  await act(async () => hook.attachSentinel(sentinel));
  assert.equal(MockIntersectionObserver.instances.length, 0);

  await hook.rerender({ ...baseProps, enabled: true, hasMore: false });
  assert.equal(MockIntersectionObserver.instances.length, 0);

  await hook.rerender({ ...baseProps, enabled: true, hasMore: true });
  assert.equal(MockIntersectionObserver.instances.length, 1);
  const observer = MockIntersectionObserver.instances[0];
  assert.equal(observer.options.root, fallbackRoot);
  assert.deepEqual(observer.observedTargets, [sentinel]);

  await hook.unmount();
  assert.equal(observer.disconnectCalls, 1);
});
