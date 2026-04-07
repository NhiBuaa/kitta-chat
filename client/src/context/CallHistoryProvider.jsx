import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { getMissedCalls } from '../services/callService';
import { CallHistoryContext } from './CallHistoryContext';
import { showMissedCallToast } from '../utils/toastUtils';

export const CallHistoryProvider = ({ children }) => {
    const { socket } = useSocket();
    const [missedCount, setMissedCount] = useState([]);

    // FETCH MISSED CALLS ON MOUNT
    const fetchMissedCount = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                return;
            }
            const response = await getMissedCalls();
            if (response.data.success) {
                const data = response.data.data;

                const finalCount = data.count !== undefined
                    ? data.count
                    : (data.missedCalls?.length || 0);

                setMissedCount(finalCount);
            }
        } catch (error) {
            console.error("Failed to fetch missed calls:", error);
        }
    }, []);

    // Lấy số ngay khi web vừa load
    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        fetchMissedCount();
    }, [fetchMissedCount]);

    // Lắng nghe "callMissed" để tăng badge + hiện Toast
    // (server emit callMissed kèm callerName/callerAvatar để toast hiển thị đúng)
    useEffect(() => {
        if (!socket) return;

        const handleCallMissed = (data) => {
            // Tăng badge
            fetchMissedCount();

            // Hiện toast với callerName thật từ server
            showMissedCallToast({
                callerName: data.callerName || 'Người dùng',
                callerAvatar: data.callerAvatar || '',
                callType: data.type === 'video' ? 'video' : 'audio',
                timeLabel: 'Vừa xong',
                toastId: `missed-call-toast-${data.callId}`,
            });
        };

        socket.on('callMissed', handleCallMissed);

        return () => {
            socket.off('callMissed', handleCallMissed);
        };
    }, [socket, fetchMissedCount]);

    const clearMissedCount = useCallback(() => {
        setMissedCount(0);
    }, []);

    return (
        <CallHistoryContext.Provider
            value={{
                missedCount,
                clearMissedCount,
                fetchMissedCount,
                setMissedCount,
            }}
        >
            {children}
        </CallHistoryContext.Provider>
    )
}