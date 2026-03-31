import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Quản lý toàn bộ scroll behavior của khung chat:
 * - scrollRef / bottomRef
 * - Auto-scroll lock (khi media load)
 * - hasNewUnread badge
 * - Scroll to bottom
 */
export const useScrollBehavior = () => {
    const scrollRef = useRef();
    const bottomRef = useRef();
    const shouldAutoScrollOnMediaLoadRef = useRef(false);
    const autoScrollReleaseTimeoutRef = useRef(null);

    const [hasNewUnread, setHasNewUnread] = useState(false);

    // Scroll xuống đáy
    const scrollChatToBottom = useCallback((behavior = "auto") => {
        if (bottomRef.current?.scrollIntoView) {
            bottomRef.current.scrollIntoView({ block: "end", behavior });
            setHasNewUnread(false);
            return;
        }
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
            setHasNewUnread(false);
        }
    }, []);

    // Giải phóng lock auto-scroll
    const releaseAutoScrollLock = useCallback(() => {
        shouldAutoScrollOnMediaLoadRef.current = false;
        if (autoScrollReleaseTimeoutRef.current) {
            clearTimeout(autoScrollReleaseTimeoutRef.current);
            autoScrollReleaseTimeoutRef.current = null;
        }
    }, []);

    // Bật lock auto-scroll (tự tắt sau 2s)
    const armAutoScrollLock = useCallback(() => {
        shouldAutoScrollOnMediaLoadRef.current = true;
        if (autoScrollReleaseTimeoutRef.current) {
            clearTimeout(autoScrollReleaseTimeoutRef.current);
        }
        autoScrollReleaseTimeoutRef.current = setTimeout(() => {
            shouldAutoScrollOnMediaLoadRef.current = false;
            autoScrollReleaseTimeoutRef.current = null;
        }, 2000);
    }, []);

    // Handler cho nút "scroll xuống"
    const handleScrollToBottom = useCallback(() => {
        armAutoScrollLock();
        scrollChatToBottom("smooth");
    }, [armAutoScrollLock, scrollChatToBottom]);

    // Scroll khi image/video load xong
    const handleMediaContentLoad = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        const distanceToBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight;
        if (shouldAutoScrollOnMediaLoadRef.current || distanceToBottom <= 150) {
            scrollChatToBottom("auto");
        }
    }, [scrollChatToBottom]);

    // User cuộn lên (rời khỏi đáy)
    const handleUserMovedAwayFromBottom = useCallback(() => {
        releaseAutoScrollLock();
    }, [releaseAutoScrollLock]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (autoScrollReleaseTimeoutRef.current) {
                clearTimeout(autoScrollReleaseTimeoutRef.current);
            }
        };
    }, []);

    return {
        scrollRef,
        bottomRef,
        hasNewUnread,
        setHasNewUnread,
        scrollChatToBottom,
        handleScrollToBottom,
        armAutoScrollLock,
        releaseAutoScrollLock,
        handleMediaContentLoad,
        handleUserMovedAwayFromBottom,
    };
};