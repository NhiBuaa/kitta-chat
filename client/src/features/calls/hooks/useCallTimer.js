import { useEffect, useState } from 'react';
import {
    getPopupDurationSeconds,
    getDelayToNextDurationTick,
} from '@/features/calls/utils/callDuration.js';

export const useCallTimer = (isJoined, callAccept, callEnd, displayStartedAt) => {
    const [now, setNow] = useState(() => new Date());
    const isTimerActive = isJoined && callAccept && !callEnd && Boolean(displayStartedAt);

    useEffect(() => {
        if (!isTimerActive) return undefined;

        let timeoutId;

        const scheduleNextTick = () => {
            timeoutId = setTimeout(() => {
                setNow(new Date());
                scheduleNextTick();
            }, getDelayToNextDurationTick({ answeredAt: displayStartedAt }));
        };

        timeoutId = setTimeout(() => {
            setNow(new Date());
            scheduleNextTick();
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [isTimerActive, displayStartedAt]);

    if (!isTimerActive) return 0;

    return getPopupDurationSeconds({ displayStartedAt, now });
};