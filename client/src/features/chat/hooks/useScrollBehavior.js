import { useRef, useState, useCallback, useEffect } from "react";
import { createScrollFollowState } from "./scrollFollowState.js";

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
    const userScrollIntentRef = useRef(false);
    const userScrollIntentTimeoutRef = useRef(null);
    const [scrollFollowState] = useState(createScrollFollowState);
    const [hasNewUnread, setHasNewUnread] = useState(false);

    // Scroll xuống đáy
    const scrollChatToBottom = useCallback((behavior = "auto") => {
        scrollFollowState.markAtBottom();
        if (bottomRef.current?.scrollIntoView) {
            bottomRef.current.scrollIntoView({ block: "end", behavior });
            setHasNewUnread(false);
            return;
        }
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
            setHasNewUnread(false);
        }
    }, [scrollFollowState]);

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
        scrollFollowState.markAtBottom();
        shouldAutoScrollOnMediaLoadRef.current = true;
        userScrollIntentRef.current = false;
        if (userScrollIntentTimeoutRef.current) {
            clearTimeout(userScrollIntentTimeoutRef.current);
            userScrollIntentTimeoutRef.current = null;
        }
        if (autoScrollReleaseTimeoutRef.current) {
            clearTimeout(autoScrollReleaseTimeoutRef.current);
        }
        autoScrollReleaseTimeoutRef.current = setTimeout(() => {
            shouldAutoScrollOnMediaLoadRef.current = false;
            autoScrollReleaseTimeoutRef.current = null;
        }, 2000);
    }, [scrollFollowState]);

    // Handler cho nút "scroll xuống"
    const handleScrollToBottom = useCallback(() => {
        armAutoScrollLock();
        scrollChatToBottom("smooth");
    }, [armAutoScrollLock, scrollChatToBottom]);

    const handleUserScrollIntent = useCallback(() => {
        releaseAutoScrollLock();
        userScrollIntentRef.current = true;
        if (userScrollIntentTimeoutRef.current) {
            clearTimeout(userScrollIntentTimeoutRef.current);
        }
        userScrollIntentTimeoutRef.current = setTimeout(() => {
            userScrollIntentRef.current = false;
            userScrollIntentTimeoutRef.current = null;
        }, 300);
    }, [releaseAutoScrollLock]);

    // Scroll khi image/video load xong
    const handleMediaContentLoad = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        if (
            shouldAutoScrollOnMediaLoadRef.current ||
            scrollFollowState.shouldFollowMediaLoad()
        ) {
            scrollChatToBottom("auto");
        }
    }, [scrollChatToBottom, scrollFollowState]);

    // Đồng bộ ý định bám đáy từ vị trí scroll hiện tại
    const handleScrollPositionChange = useCallback((distanceToBottom) => {
        scrollFollowState.updateFromDistance(distanceToBottom, {
            allowMovingAway: userScrollIntentRef.current,
        });
    }, [scrollFollowState]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (autoScrollReleaseTimeoutRef.current) {
                clearTimeout(autoScrollReleaseTimeoutRef.current);
            }
            if (userScrollIntentTimeoutRef.current) {
                clearTimeout(userScrollIntentTimeoutRef.current);
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
        handleUserScrollIntent,
        handleMediaContentLoad,
        handleScrollPositionChange,
    };
};