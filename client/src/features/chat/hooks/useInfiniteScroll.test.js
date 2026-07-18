import assert from "node:assert/strict";
import test from "node:test";
import { setupInfiniteScrollObserver } from "./useInfiniteScroll.js";

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observedTargets = [];
    this.disconnected = false;
  }

  observe(target) {
    this.observedTargets.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  // Helper to simulate intersection
  triggerIntersect(isIntersecting) {
    this.callback([{ isIntersecting }]);
  }
}

test("setupInfiniteScrollObserver creates observer and observes sentinel when hasMore is true", () => {
  const sentinel = { id: "sentinel-1" };
  const root = { id: "root-1" };
  let loadMoreCalled = false;
  const isFetchingRef = { current: false };

  const observer = setupInfiniteScrollObserver({
    sentinel,
    root,
    hasMore: true,
    isFetchingRef,
    onLoadMore: () => {
      loadMoreCalled = true;
    },
    IntersectionObserverClass: MockIntersectionObserver,
  });

  assert.ok(observer);
  assert.equal(observer.options.root, root);
  assert.deepEqual(observer.observedTargets, [sentinel]);
});

test("setupInfiniteScrollObserver does not create observer when hasMore is false", () => {
  const sentinel = { id: "sentinel-1" };
  const isFetchingRef = { current: false };

  const observer = setupInfiniteScrollObserver({
    sentinel,
    root: null,
    hasMore: false,
    isFetchingRef,
    onLoadMore: () => {},
    IntersectionObserverClass: MockIntersectionObserver,
  });

  assert.equal(observer, null);
});

test("setupInfiniteScrollObserver triggers onLoadMore and locks ref on intersect", () => {
  const sentinel = { id: "sentinel-1" };
  let loadMoreCount = 0;
  const isFetchingRef = { current: false };

  const observer = setupInfiniteScrollObserver({
    sentinel,
    root: null,
    hasMore: true,
    isFetchingRef,
    onLoadMore: () => {
      loadMoreCount++;
    },
    IntersectionObserverClass: MockIntersectionObserver,
  });

  // Simulate intersecting
  observer.triggerIntersect(true);
  assert.equal(loadMoreCount, 1);
  assert.equal(isFetchingRef.current, true); // Lock is active

  // Try intersecting again while ref is locked
  observer.triggerIntersect(true);
  assert.equal(loadMoreCount, 1); // Should not call onLoadMore again
});
