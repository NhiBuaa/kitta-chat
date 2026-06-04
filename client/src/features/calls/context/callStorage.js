const CALL_STORAGE_KEYS = [
    'activePartnerUserId', 'tempCallerId', 'tempCallerUserId',
    'tempCallSignal', 'tempCallerMediaStatus', 'tempCallType',
    'callStartTime', 'tempCallId', 'callAnsweredAt',
];

export const clearCallStorage = () =>
    CALL_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));

export const getStoredPartnerMediaStatus = () => {
    try {
        const stored = localStorage.getItem('tempCallerMediaStatus');
        return stored ? JSON.parse(stored) : { cam: true, mic: true };
    } catch {
        return { cam: true, mic: true };
    }
};

/**
 * Trả về true nếu localStorage có state cuộc gọi cũ / bị hỏng cần xóa.
 */
export const isCallStorageStale = () => {
    const startedAt = parseInt(localStorage.getItem('callStartTime') || '0', 10);
    const hasDangling = ['tempCallId', 'activePartnerUserId', 'tempCallerUserId', 'tempCallerId', 'tempCallSignal']
        .some((k) => Boolean(localStorage.getItem(k)));
    const isExpired = startedAt > 0 && Date.now() - startedAt > 2 * 60 * 1000;
    const isBroken =
        Boolean(localStorage.getItem('tempCallId')) &&
        !['activePartnerUserId', 'tempCallerUserId', 'tempCallerId'].some((k) => localStorage.getItem(k));
    return (hasDangling && isExpired) || isBroken;
};

export const getStoredCallAnsweredAt = () => {
    const answeredAt = localStorage.getItem('callAnsweredAt');
    if (!answeredAt) return null;

    return Number.isFinite(new Date(answeredAt).getTime()) ? answeredAt : null;
};

export const persistCallAnsweredAt = (answeredAt) => {
    if (!answeredAt || !Number.isFinite(new Date(answeredAt).getTime())) return;

    localStorage.setItem('callAnsweredAt', answeredAt);
};
