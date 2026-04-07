import { useEffect, useRef, useState } from 'react';
import { CALL_STATES } from './CallStates';
import { getStoredPartnerMediaStatus } from './callStorage';

/**
 * Quản lý toàn bộ state và refs của hệ thống gọi.
 * Export ra một "bag" duy nhất để các hook khác dùng chung.
 */
export const useCallState = () => {
    // ─── State ────────────────────────────────────────────────────────────────
    const [callState, setCallState] = useState(CALL_STATES.IDLE);
    const [isPreparingCall, setIsPreparingCall] = useState(false);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
    const [callId, setCallId] = useState(null);
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
    const [isCalling, setIsCalling] = useState(false);
    const [me, setMe] = useState('');
    const [partnerMediaStatus, setPartnerMediaStatus] = useState(getStoredPartnerMediaStatus);

    // ─── Refs (luôn fresh, dùng trong closures / callbacks) ──────────────────
    const callStateRef = useRef(callState);
    const callAcceptedRef = useRef(callAccepted);  // dùng thay state trong leaveCall
    const isPreparingCallRef = useRef(isPreparingCall);
    const isOutgoingCallRef = useRef(false);
    const mySocketIdRef = useRef('');
    const isGlareWaitingRef = useRef(false);
    const glareWinnerDataRef = useRef(null);
    const isGlareLoserRef = useRef(false);
    const glareLoserPartnerRef = useRef(null);
    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef(null);
    const streamRef = useRef(null);
    const callTimeoutRef = useRef(null);
    const localStreamRef = useRef(null);

    // Giữ refs đồng bộ với state
    useEffect(() => { callStateRef.current = callState; }, [callState]);
    useEffect(() => { callAcceptedRef.current = callAccepted; }, [callAccepted]);
    useEffect(() => { isPreparingCallRef.current = isPreparingCall; }, [isPreparingCall]);

    // ─── Base operations ──────────────────────────────────────────────────────
    const updateStream = (newStream) => {
        streamRef.current = newStream;
        setStream(newStream);
    };

    const cleanupConnection = () => {
        if (connectionRef.current) {
            try { connectionRef.current.destroy(); } catch { /* noop */ }
            connectionRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (window.localStream) {
            window.localStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
            window.localStream = null;
        }
        setStream(null);
        setRemoteStream(null);
        setPartnerMediaStatus({ cam: true, mic: true });
        setCallAccepted(false);
        setIsCalling(false);
        setCallId(null);
        setCallState(CALL_STATES.IDLE);
        setCall({});
        setCallEnded(true);
    };

    return {
        // state & setters
        callState, setCallState,
        isPreparingCall, setIsPreparingCall,
        stream, remoteStream, setRemoteStream,
        call, setCall,
        callId, setCallId,
        callAccepted, setCallAccepted,
        callEnded, setCallEnded,
        isCalling, setIsCalling,
        me, setMe,
        partnerMediaStatus, setPartnerMediaStatus,
        // refs
        callStateRef, callAcceptedRef, isPreparingCallRef, isOutgoingCallRef,
        mySocketIdRef, isGlareWaitingRef, glareWinnerDataRef,
        isGlareLoserRef, glareLoserPartnerRef,
        myVideo, userVideo, connectionRef, streamRef,
        callTimeoutRef, localStreamRef,
        // base operations
        updateStream,
        cleanupConnection,
    };
};