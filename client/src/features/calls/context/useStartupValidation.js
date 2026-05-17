import { useEffect } from 'react';
import { CALL_STATES } from '@/features/calls/context/CallStates.js';
import { clearCallStorage, isCallStorageStale } from '@/features/calls/context/callStorage.js';

/**
 * Chạy một lần khi mount: reset localStorage stale/broken từ session cũ.
 * Hợp nhất 2 useEffect startup của file gốc thành 1.
 */
export const useStartupValidation = ({ setCallState, setCallEnded }) => {
    useEffect(() => {
        queueMicrotask(() => {
            const callStartTime = parseInt(localStorage.getItem('callStartTime') || '0', 10);
            const age = callStartTime > 0 ? Date.now() - callStartTime : 0;
            const tooOld = age > 2 * 60 * 1000;

            if (tooOld || isCallStorageStale()) {
                clearCallStorage();
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
};