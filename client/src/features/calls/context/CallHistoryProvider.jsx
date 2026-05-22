import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/services/socket/SocketContext.js';
import { getMissedCalls } from '@/services/webrtc/callService.js';
import { CallHistoryContext } from '@/features/calls/context/CallHistoryContext.js';
import { showMissedCallToast } from '@/utils/toastUtils.js';
import {
    applyCallHistorySyncToMissedCount,
    applyCallLogMessageToMissedCount,
    clearMissedCallCount,
    getCurrentUserId,
    hydrateMissedCount,
    hydrateMissedCountForCurrentUser,
    subscribeCallHistoryAuthRefresh,
    subscribeCallHistoryRefresh,
} from '@/features/calls/context/callHistoryBadgeState.js';
import { getAccessToken, getStoredUser } from '@/services/auth/authSession.js';

export const CallHistoryProvider = ({ children }) => {
    const { socket, currentUser } = useSocket();
    const [missedCount, setMissedCount] = useState(0);
    const isFetchingMissedCountRef = useRef(false);
    const currentUserId = getCurrentUserId(currentUser);

    // Track callIds đã xử lý bởi callHistorySync để tránh duplicate với callLogMessage
    const processedCallIds = useRef(new Set());

    // FETCH MISSED CALLS ON MOUNT
    const fetchMissedCount = useCallback(async () => {
        try {
            await hydrateMissedCount({
                getToken: getAccessToken,
                getMissedCalls,
                setMissedCount,
                isFetchingRef: isFetchingMissedCountRef,
            });
        } catch (error) {
            console.error("Failed to fetch missed calls:", error);
        }
    }, []);

    // Effect 1: fetch số lượng missed call khi component mount
    useEffect(() => {
        fetchMissedCount();
    }, [fetchMissedCount]);

    useEffect(() => {
        hydrateMissedCountForCurrentUser({
            currentUserId,
            hydrate: fetchMissedCount,
        });
    }, [currentUserId, fetchMissedCount]);

    useEffect(() => subscribeCallHistoryRefresh({ fetchMissedCount }), [fetchMissedCount]);
    useEffect(() => subscribeCallHistoryAuthRefresh({ fetchMissedCount }), [fetchMissedCount]);

    // Effect 2: lắng nghe callHistorySync — cập nhật badge count khi có thay đổi call
    useEffect(() => {
        if (!socket) return;

        const handleCallHistorySync = (data) => {
            // DEBUG
            console.log("[CallHistoryProvider] callHistorySync received:", JSON.stringify(data));

            // Chỉ receiver (direction === 'incoming') mới tăng badge.
            if (data.direction === 'incoming' && data.isReadByCurrentUser === false) {
                const missedStatuses = ['missed', 'rejected', 'unreachable', 'busy'];
                if (missedStatuses.includes(data.status)) {
                    setMissedCount((prev) => applyCallHistorySyncToMissedCount({
                        previousCount: prev,
                        data,
                        processedCallIds: processedCallIds.current,
                    }));
                }
            }

            // Hiện toast nếu là incoming chưa đọc và status là missed (timeout)
            if (data.direction === 'incoming' && data.status === 'missed' && data.isReadByCurrentUser === false) {
                const caller = data.callerId;
                showMissedCallToast({
                    callerName: caller?.displayName || caller?.username || 'Người dùng',
                    callerAvatar: caller?.avatar || '',
                    callType: data.type === 'video' ? 'video' : 'audio',
                    timeLabel: 'Vừa xong',
                    onRecall: (callType) => {
                        const chatUserId = caller?._id || caller;
                        if (!chatUserId) return;
                        const sessionId = Date.now();
                        const url = `/call/${chatUserId}?name=${encodeURIComponent(caller?.displayName || 'Người dùng')}&avatar=${encodeURIComponent(caller?.avatar || '')}&type=${callType}&session=${sessionId}`;
                        localStorage.setItem('activePartnerUserId', chatUserId);
                        localStorage.setItem('tempCallType', callType);
                        window.open(url, '_blank');
                    },
                    onOpenChat: () => {
                        const chatUserId = caller?._id || caller;
                        if (chatUserId) {
                            window.dispatchEvent(new CustomEvent('open-chat-with', { detail: { userId: chatUserId } }));
                        }
                    },
                    toastId: `missed-call-toast-${data.callId}`,
                });
            }
        };

        socket.on('callHistorySync', handleCallHistorySync);
        return () => socket.off('callHistorySync', handleCallHistorySync);
    }, [socket]);

    // Effect 3: FALLBACK — lắng nghe callLogMessage để tăng badge.
    // Phòng trường hợp callHistorySync không gửi được (ví dụ B mất kết nối tạm thời).
    // callLogMessage được emit cùng lúc với callHistorySync nên đây là backup.
    useEffect(() => {
        if (!socket) return;

        const handleCallLogMessage = (data) => {
            if (data.type !== 'call_log') return;
            const storedUser = getStoredUser() || {};
            const currentUserId = storedUser._id || storedUser.id;
            setMissedCount((prev) => applyCallLogMessageToMissedCount({
                previousCount: prev,
                data,
                currentUserId,
                processedCallIds: processedCallIds.current,
            }));
        };

        socket.on('callLogMessage', handleCallLogMessage);
        return () => socket.off('callLogMessage', handleCallLogMessage);
    }, [socket]);

    // Effect 4: callHistorySync là NGUỒN DUY NHẤT tăng badge.
    // KHÔNG dùng callTimeout/callRejected/callCancelled/callEnded
    // vì chúng đều emit cùng callHistorySync → double increment.

    const clearMissedCount = useCallback(() => setMissedCount(clearMissedCallCount), []);

    return (
        <CallHistoryContext.Provider value={{ missedCount, clearMissedCount, fetchMissedCount, setMissedCount }}>
            {children}
        </CallHistoryContext.Provider>
    );
}
