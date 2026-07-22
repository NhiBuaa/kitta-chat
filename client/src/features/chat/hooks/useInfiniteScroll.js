import { useEffect, useRef, useState, useCallback } from "react";

export const setupInfiniteScrollObserver = ({
  sentinel,
  root,
  hasMore,
  isFetchingRef,
  onLoadMore,
  IntersectionObserverClass = globalThis.IntersectionObserver,
}) => {
  if (!sentinel || !hasMore) return null;

  // Dynamically resolve root scroll container from DOM hierarchy to avoid ref timing bugs
  const resolvedRoot =
    root ||
    (typeof sentinel.closest === "function" ? sentinel.closest(".overflow-y-auto") : null) ||
    sentinel.parentElement ||
    null;

  const observer = new IntersectionObserverClass(
    (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isFetchingRef.current && hasMore) {
        isFetchingRef.current = true;
        onLoadMore();
      }
    },
    {
      root: resolvedRoot,
      threshold: 0.1,
    }
  );

  observer.observe(sentinel);
  return observer;
};

export const useInfiniteScroll = ({
  enabled = true,
  hasMore,
  isFetching,
  onLoadMore,
  rootRef,
}) => {
  const [sentinelNode, setSentinelNode] = useState(null);
  const isFetchingRef = useRef(false);

  const sentinelRef = useCallback((node) => {
    setSentinelNode(node);
  }, []);

  // Synchronously update the fetching state ref to mirror isFetching prop
  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  // Keep onLoadMore stable across renders using a ref to prevent observer re-creation
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!enabled || !sentinelNode) return;

    const observer = setupInfiniteScrollObserver({
      sentinel: sentinelNode,
      root: rootRef?.current,
      hasMore,
      isFetchingRef,
      onLoadMore: () => onLoadMoreRef.current(),
    });

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [enabled, hasMore, rootRef, sentinelNode]);

  return sentinelRef;
};

