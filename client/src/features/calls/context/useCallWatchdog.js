import { useEffect } from 'react';

const WATCHDOG_INTERVAL_MS = 3_000;
const MIN_CALL_DURATION_MS = 5_000;

/**
 * Watchdog: tự động leaveCall nếu remote stream biến mất trong lúc đang kết nối.
 */
export const useCallWatchdog = ({ callAccepted, callEnded, connectionRef, remoteStream, leaveCall }) => {
    useEffect(() => {
        if (!callAccepted || callEnded || !connectionRef.current) return;

        const id = setInterval(() => {
            if (!connectionRef.current) {
                leaveCall();
                return;
            }
            if (!remoteStream || remoteStream.getTracks().length === 0) {
                const callStartTime = parseInt(localStorage.getItem('callStartTime') || '0', 10);
                if (Date.now() - callStartTime > MIN_CALL_DURATION_MS) {
                    leaveCall();
                }
            }
        }, WATCHDOG_INTERVAL_MS);

        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callAccepted, callEnded, remoteStream]);
};