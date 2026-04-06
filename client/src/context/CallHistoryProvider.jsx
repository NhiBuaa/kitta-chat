import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { getMissedCalls } from '../services/callService';
import { CallHistoryContext } from './CallHistoryContext';

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
                setMissedCount(response.data.data.missedCalls);
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

    // Lắng nghe sự kiện call_missed từ server để cập nhật số cuộc gọi nhỡ theo thời gian thực
    useEffect(() => {
        if (!socket) return;

        const handleCallHistorySync = (data) => {
            if (data.direction === 'incoming') {
                const isMissedStatus = ['missed', 'unanswered', 'rejected', 'busy'].includes(data.status);

                if (isMissedStatus && !data.isReadByCurrentUser) {
                    fetchMissedCount();
                }
            }
        };

        socket.on('callHistorySync', handleCallHistorySync);

        return () => {
            socket.off('callHistorySync', handleCallHistorySync);
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