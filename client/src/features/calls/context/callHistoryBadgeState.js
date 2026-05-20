export const CALL_HISTORY_REFRESH_EVENT = "call-history-refresh-needed";
export const AUTH_CHANGED_EVENT = "auth-changed";

const FINAL_UNREAD_CALL_STATUSES = new Set(["missed", "rejected", "unreachable", "busy"]);

export const shouldHydrateMissedCount = ({ token }) => Boolean(token);

export const getCurrentUserId = (currentUser) => (
    currentUser?._id || currentUser?.id || null
);

export const readMissedCountFromResponse = (data) => {
    if (!data) return 0;
    if (data.count !== undefined) return Number(data.count) || 0;
    if (Array.isArray(data.calls)) return data.calls.length;
    if (Array.isArray(data.missedCalls)) return data.missedCalls.length;
    return 0;
};

export const clearMissedCallCount = () => 0;

export const hydrateMissedCount = async ({
    getToken,
    getMissedCalls,
    setMissedCount,
    isFetchingRef,
}) => {
    const token = getToken?.();
    if (!shouldHydrateMissedCount({ token }) || isFetchingRef?.current) return;

    try {
        if (isFetchingRef) isFetchingRef.current = true;
        const response = await getMissedCalls();
        if (response?.data?.success) {
            setMissedCount(readMissedCountFromResponse(response.data.data));
        }
    } finally {
        if (isFetchingRef) isFetchingRef.current = false;
    }
};

export const hydrateMissedCountForCurrentUser = async ({
    currentUserId,
    hydrate,
}) => {
    if (!currentUserId || typeof hydrate !== "function") return;
    await hydrate();
};

export const dispatchCallHistoryRefresh = (target = window) => {
    if (!target?.dispatchEvent) return;
    target.dispatchEvent(new Event(CALL_HISTORY_REFRESH_EVENT));
};

export const subscribeCallHistoryRefresh = ({
    target = window,
    fetchMissedCount,
}) => {
    if (!target?.addEventListener || typeof fetchMissedCount !== "function") {
        return () => {};
    }

    target.addEventListener(CALL_HISTORY_REFRESH_EVENT, fetchMissedCount);
    return () => target.removeEventListener(CALL_HISTORY_REFRESH_EVENT, fetchMissedCount);
};

export const subscribeCallHistoryAuthRefresh = ({
    target = window,
    fetchMissedCount,
}) => {
    if (!target?.addEventListener || typeof fetchMissedCount !== "function") {
        return () => {};
    }

    target.addEventListener(AUTH_CHANGED_EVENT, fetchMissedCount);
    target.addEventListener("storage", fetchMissedCount);
    return () => {
        target.removeEventListener(AUTH_CHANGED_EVENT, fetchMissedCount);
        target.removeEventListener("storage", fetchMissedCount);
    };
};

export const applyCallHistorySyncToMissedCount = ({
    previousCount,
    data,
    processedCallIds,
}) => {
    const count = Number(previousCount) || 0;
    if (data?.direction !== "incoming") return count;
    if (data?.isReadByCurrentUser !== false) return count;
    if (!FINAL_UNREAD_CALL_STATUSES.has(data?.status)) return count;

    const callId = data.callId;
    if (callId && processedCallIds?.has(callId)) return count;
    if (callId) processedCallIds?.add(callId);
    return count + 1;
};

export const applyCallLogMessageToMissedCount = ({
    previousCount,
    data,
    currentUserId,
    processedCallIds,
}) => {
    const count = Number(previousCount) || 0;
    if (data?.type !== "call_log") return count;
    if (!FINAL_UNREAD_CALL_STATUSES.has(data?.callData?.status)) return count;

    const senderId = typeof data.senderId === "string"
        ? data.senderId
        : data.sender?._id?.toString();
    if (senderId === currentUserId) return count;

    const callId = data.callData?.callHistoryId || data.callId;
    if (callId && processedCallIds?.has(callId)) return count;
    if (callId) processedCallIds?.add(callId);
    return count + 1;
};
