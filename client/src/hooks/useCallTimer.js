import {useState, useEffect} from 'react';

export const useCallTimer = (isJoined, callAccept, callEnd) => {
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        let interval;

        if(isJoined && callAccept && !callEnd) {
            interval = setInterval(() => {
                setCallDuration((prev) => prev + 1);
            }, 1000);
        } else {
            clearInterval(interval);
        }

        return () => clearInterval(interval);
    }, [isJoined, callAccept, callEnd])

    return callDuration;
}