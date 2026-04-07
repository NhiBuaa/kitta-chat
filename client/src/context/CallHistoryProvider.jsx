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
            // DEBUG
            console.log("[CallHistoryProvider] callHistorySync received:", JSON.stringify(data));

            // Chỉ receiver (direction === 'incoming') mới tăng badge.
            // Realtime: cả caller và receiver đều nhận isReadByCurrentUser === false
            // nhưng chỉ receiver mới được tính là "missed" (API /missed chỉ đếm receiver).
            if (data.direction === 'incoming' && data.isReadByCurrentUser === false) {
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

    // Effect 3: FALLBACK — lắng nghe callLogMessage để tăng badge.
    // Phòng trường hợp callHistorySync không gửi được (ví dụ B mất kết nối tạm thời).
    // callLogMessage được emit cùng lúc với callHistorySync nên đây là backup.
    useEffect(() => {
        if (!socket) return;

        const handleCallLogMessage = (data) => {
            if (data.type !== 'call_log') return;
            const missedStatuses = ['missed', 'rejected', 'unreachable', 'busy'];
            if (!missedStatuses.includes(data.callData?.status)) return;

            // Kiểm tra: mình là receiver (không phải sender)
            const currentUserId = JSON.parse(localStorage.getItem('user') || '{}')._id || JSON.parse(localStorage.getItem('user') || '{}').id;
            const senderId = typeof data.senderId === 'string' ? data.senderId : data.sender?._id?.toString();
            if (senderId === currentUserId) return; // mình là caller → không tăng

            setMissedCount((prev) => prev + 1);
        };

        socket.on('callLogMessage', handleCallLogMessage);
        return () => socket.off('callLogMessage', handleCallLogMessage);
    }, [socket]);

    // Effect 4: callHistorySync là NGUỒN DUY NHẤT tăng badge.
    // KHÔNG dùng callTimeout/callRejected/callCancelled/callEnded
    // vì chúng đều emit cùng callHistorySync → double increment.

    const clearMissedCount = useCallback(() => setMissedCount(0), []);

    return (
        <CallHistoryContext.Provider value={{ missedCount, clearMissedCount, fetchMissedCount, setMissedCount }}>
            {children}
        </CallHistoryContext.Provider>
    );
}