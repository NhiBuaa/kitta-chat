import { useEffect, useRef } from "react";

export const setupInfiniteScrollObserver = ({
  sentinel,
  root,
  hasMore,
  isFetchingRef,
  onLoadMore,
  IntersectionObserverClass = globalThis.IntersectionObserver,
}) => {
  if (!sentinel || !hasMore) return null;

  const observer = new IntersectionObserverClass(
    (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isFetchingRef.current && hasMore) {
        isFetchingRef.current = true;
        onLoadMore();
      }
    },
    {
      root: root || null,
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
  const sentinelRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Synchronously update the fetching state ref to mirror isFetching prop
  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  useEffect(() => {
    if (!enabled) return;

    const observer = setupInfiniteScrollObserver({
      sentinel: sentinelRef.current,
      root: rootRef?.current,
      hasMore,
      isFetchingRef,
      onLoadMore,
    });

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [enabled, hasMore, onLoadMore, rootRef]);

  return sentinelRef;
};
