/**
 * Polyfill cho simple-peer trong môi trường browser
 */
window.global = window;
window.process = { env: { DEBUG: undefined }, version: '', nextTick: (cb) => setTimeout(cb, 0) };
window.Buffer = window.Buffer || [];

import React, { createContext } from 'react';
import { useSocket } from '../SocketContext.js';

import { useCallState } from './useCallState';
import { useCallActions } from './useCallActions';
import { useSocketEvents } from './useSocketEvents';
import { useCallWatchdog } from './useCallWatchdog';
import { useWindowSync } from './useWindowSync';
import { useStartupValidation } from './useStartupValidation';

const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket } = useSocket();

    // Tất cả state + refs + base operations
    const bag = useCallState();

    // Actions: callUser, answerCall, rejectCall, leaveCall
    const actions = useCallActions({ socket, bag });

    // Side effects
    useStartupValidation({ setCallState: bag.setCallState, setCallEnded: bag.setCallEnded });
    useSocketEvents({ socket, bag, actions });
    useCallWatchdog({
        callAccepted: bag.callAccepted,
        callEnded: bag.callEnded,
        connectionRef: bag.connectionRef,
        remoteStream: bag.remoteStream,
        leaveCall: actions.leaveCall,
    });
    useWindowSync({
        callStateRef: bag.callStateRef,
        setCallState: bag.setCallState,
        setCallEnded: bag.setCallEnded,
        cleanupConnection: bag.cleanupConnection,
    });

    return (
        <CallContext.Provider
            value={{
                // State
                call: bag.call,
                callAccepted: bag.callAccepted,
                callState: bag.callState,
                callEnded: bag.callEnded,
                isCalling: bag.isCalling,
                me: bag.me,
                stream: bag.stream,
                remoteStream: bag.remoteStream,
                partnerMediaStatus: bag.partnerMediaStatus,
                callId: bag.callId,
                isPreparingCall: bag.isPreparingCall,
                // Refs
                myVideo: bag.myVideo,
                userVideo: bag.userVideo,
                // Setters
                setStream: bag.updateStream,
                setCall: bag.setCall,
                setCallId: bag.setCallId,
                setIsPreparingCall: bag.setIsPreparingCall,
                // Actions
                callUser: actions.callUser,
                answerCall: actions.answerCall,
                leaveCall: actions.leaveCall,
                rejectCall: actions.rejectCall,
            }}
        >
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };