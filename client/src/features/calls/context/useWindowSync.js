import { useEffect } from 'react';
import { CALL_STATES } from '@/features/calls/context/CallStates.js';

/**
 * Đồng bộ trạng thái cuộc gọi khi:
 * - Cửa sổ/tab bị đóng (pagehide / beforeunload)
 * - Tab khác xóa callStartTime khỏi localStorage
 */
export const useWindowSync = ({ callStateRef, setCallState, setCallEnded, cleanupConnection }) => {
    useEffect(() => {
        const handleWindowClose = () => {
            if (callStateRef.current !== CALL_STATES.IDLE) {
                localStorage.removeItem('callStartTime');
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                cleanupConnection();
            }
        };

        const handleStorageChange = (e) => {
            if (e.key === 'callStartTime' && e.newValue === null && callStateRef.current !== CALL_STATES.IDLE) {
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                cleanupConnection();
            }
        };

        window.addEventListener('pagehide', handleWindowClose);
        window.addEventListener('beforeunload', handleWindowClose);
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('pagehide', handleWindowClose);
            window.removeEventListener('beforeunload', handleWindowClose);
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
};