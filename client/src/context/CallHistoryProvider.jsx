import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { getMissedCalls } from '../services/callService';
import { CallHistoryContext } from './CallHistoryContext';
import { showMissedCallToast } from '../utils/toastUtils';

export const CallHistoryProvider = ({ children }) => {
    const { socket } = useSocket();
    const [missedCount, setMissedCount] = useState(0);

    // FETCH MISSED CALLS ON MOUNT
    const fetchMissedCount = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            const response = await getMissedCalls();
            if (response.data.success) {
                const data = response.data.data;
                const finalCount = data.count !== undefined ? data.count : (data.missedCalls?.length || 0);
                setMissedCount(finalCount);
            }
        } catch (error) {
            console.error("Failed to fetch missed calls:", error);
        }
    }, []);

    // Effect 1: fetch số lượng missed call khi component mount
    useEffect(() => {
        fetchMissedCount();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect 2: lắng nghe callHistorySync — cập nhật badge count khi có thay đổi call
    useEffect(() => {
        if (!socket) return;

        const handleCallHistorySync = (data) => {
            // Chỉ tăng badge khi: chưa đọc VÀ là loại missed/rejected/unreachable/busy
            if (data.isReadByCurrentUser === false) {
                const missedStatuses = ['missed', 'rejected', 'unreachable', 'busy'];
                if (missedStatuses.includes(data.status)) {
                    setMissedCount((prev) => prev + 1);
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

    // Effect 3: lắng nghe callTimeout để tăng badge trực tiếp (phòng trường hợp
    // server emit callTimeout mà không emit callHistorySync cùng lúc)
    useEffect(() => {
        if (!socket) return;

        const handleCallTimeout = () => {
            setMissedCount((prev) => prev + 1);
        };

        socket.on('callTimeout', handleCallTimeout);
        return () => socket.off('callTimeout', handleCallTimeout);
    }, [socket]);

    // Effect 4: lắng nghe callRejected (B từ chối / busy) → tăng badge cho A
    useEffect(() => {
        if (!socket) return;

        const handleCallRejected = () => {
            setMissedCount((prev) => prev + 1);
        };

        socket.on('callRejected', handleCallRejected);
        return () => socket.off('callRejected', handleCallRejected);
    }, [socket]);

    // Effect 5: lắng nghe callCancelled (A tự hủy) → tăng badge cho B
    useEffect(() => {
        if (!socket) return;

        const handleCallCancelled = () => {
            setMissedCount((prev) => prev + 1);
        };

        socket.on('callCancelled', handleCallCancelled);
        return () => socket.off('callCancelled', handleCallCancelled);
    }, [socket]);

    const clearMissedCount = useCallback(() => setMissedCount(0), []);

    return (
        <CallHistoryContext.Provider value={{ missedCount, clearMissedCount, fetchMissedCount, setMissedCount }}>
            {children}
        </CallHistoryContext.Provider>
    );
}