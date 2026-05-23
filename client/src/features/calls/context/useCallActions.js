import Peer from 'simple-peer';
import { toast } from 'react-toastify';
import { SOCKET_EVENTS } from '@/constants/socketEvents.js';
import { CALL_STATES } from '@/features/calls/context/CallStates.js';
import { ICE_SERVERS } from '@/features/calls/context/constants.js';
import { clearCallStorage } from '@/features/calls/context/callStorage.js';
import { sendLocalMediaStatusSnapshot } from '@/features/calls/context/callMediaState.js';
import { getStoredUser } from '@/services/auth/authSession.js';
import { getLeaveCallEvent } from '@/features/calls/context/callLifecycleState.js';

/**
 * Các action thực hiện cuộc gọi: callUser, answerCall, rejectCall, leaveCall.
 * Nhận vào socket và bag (từ useCallState) để thao tác state/refs.
 */
export const useCallActions = ({ socket, bag }) => {
    const {
        callStateRef, callAcceptedRef,
        isOutgoingCallRef, connectionRef, callTimeoutRef, localStreamRef, userVideo,
        setCallState, setCallAccepted, setCallEnded, setIsCalling,
        setCall, setCallId, setPartnerMediaStatus, setRemoteStream,
        updateStream, cleanupConnection,
    } = bag;

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const clearStoredCallState = () => {
        clearCallStorage();
        setCallId(null);
    };

    const makePeer = ({ initiator, stream, onSignal, onStream, onError }) => {
        const peer = new Peer({ initiator, trickle: false, stream, config: ICE_SERVERS });
        peer.on('signal', onSignal);
        peer.on('stream', onStream);
        peer.on('error', onError ?? (() => leaveCall('peer:error')));
        peer.on('close', () => {
            if (callStateRef.current === CALL_STATES.CONNECTED) leaveCall('peer:close-connected');
        });
        return peer;
    };

    // ─── Actions ──────────────────────────────────────────────────────────────
    const callUser = (receiverUserId, localStream, isCamOn = true, isMicOn = true, callType = 'video') => {
        const freshUser = getStoredUser();
        if (!freshUser) { toast.error('Phiên đăng nhập hết hạn.'); return; }
        if (!receiverUserId || !localStream) return;
        if (!socket?.id) { toast.error('Mất kết nối máy chủ.'); return; }

        updateStream(localStream);
        localStreamRef.current = localStream;
        setCallAccepted(false);
        callAcceptedRef.current = false;
        setCallEnded(false);
        setIsCalling(true);
        setCall({});
        setCallState(CALL_STATES.CALLING);
        callStateRef.current = CALL_STATES.CALLING;
        isOutgoingCallRef.current = true;
        setPartnerMediaStatus({ cam: true, mic: true });
        setCall((prev) => ({ ...prev, userToCall: receiverUserId }));

        // Tạo tempCallId ngay lập tức để xử lý cancel trước khi server phản hồi
        const tempCallId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('tempCallId', tempCallId);
        setCallId(tempCallId);
        localStorage.setItem('activePartnerUserId', receiverUserId);
        localStorage.setItem('callStartTime', String(Date.now()));

        // Emit initCall TRƯỚC khi peer signal để server tạo record ngay
        socket.emit(SOCKET_EVENTS.CALL_INIT, { userToCall: receiverUserId, typeCall: callType, callId: tempCallId, from: socket.id });

        const peer = makePeer({
            initiator: true,
            stream: localStream,
            onSignal: (data) => {
                socket.emit(SOCKET_EVENTS.CALL_OFFER, {
                    userToCall: receiverUserId,
                    signalData: data,
                    from: socket.id,
                    callerDbId: freshUser._id || freshUser.id,
                    mediaStatus: { cam: isCamOn, mic: isMicOn },
                    typeCall: callType,
                    callId: tempCallId,
                });
            },
            onStream: (remote) => {
                setRemoteStream(remote);
                if (userVideo.current) userVideo.current.srcObject = remote;
            },
        });

        socket.off(SOCKET_EVENTS.CALL_ACCEPTED);
        socket.once(SOCKET_EVENTS.CALL_ACCEPTED, (payload) => {
            clearTimeout(callTimeoutRef.current);
            const signal = payload?.signal || payload;
            setCallAccepted(true);
            callAcceptedRef.current = true;
            setCallEnded(false);
            setCallState(CALL_STATES.CONNECTED);
            callStateRef.current = CALL_STATES.CONNECTED;
            if (payload?.mediaStatus) setPartnerMediaStatus(payload.mediaStatus);
            sendLocalMediaStatusSnapshot({
                socket,
                to: receiverUserId,
                stream: localStreamRef.current,
                fallback: { cam: isCamOn, mic: isMicOn },
            });
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    const answerCall = (currentStream, isCamOn = true, isMicOn = true) => {
        const callerUserId = localStorage.getItem('tempCallerUserId');
        const savedSignal = localStorage.getItem('tempCallSignal');
        if (!savedSignal || !callerUserId || savedSignal === 'undefined') {
            toast.error('Mất tín hiệu cuộc gọi.');
            return false;
        }

        localStreamRef.current = currentStream;
        localStorage.setItem('activePartnerUserId', callerUserId);
        const signalToUse = JSON.parse(savedSignal);

        setCallAccepted(true);
        callAcceptedRef.current = true;
        setCallEnded(false);
        setCallState(CALL_STATES.CONNECTED);
        callStateRef.current = CALL_STATES.CONNECTED;
        updateStream(currentStream);

        const peer = makePeer({
            initiator: false,
            stream: currentStream,
            onSignal: (data) => {
                socket.emit(SOCKET_EVENTS.CALL_ANSWER, {
                    signal: data,
                    to: callerUserId,
                    mediaStatus: { cam: isCamOn, mic: isMicOn },
                    callId: localStorage.getItem('tempCallId') || null,
                });
            },
            onStream: (remote) => {
                setRemoteStream(remote);
                if (userVideo.current) userVideo.current.srcObject = remote;
            },
        });

        peer.signal(signalToUse);
        connectionRef.current = peer;

        setTimeout(() => {
            localStorage.removeItem('tempCallSignal');
            localStorage.removeItem('tempCallerId');
            localStorage.removeItem('tempCallerUserId');
        }, 2000);

        return true;
    };

    const rejectCall = () => {
        const callerUserId =
            localStorage.getItem('tempCallerUserId') || localStorage.getItem('tempCallerId');
        const callId = localStorage.getItem('tempCallId') || null;
        if (socket && callerUserId) {
            socket.emit(SOCKET_EVENTS.CALL_REJECT, { to: callerUserId, callId, reason: 'rejected' });
        }
        setCall((prev) => ({ ...prev, isReceivingCall: false }));
        clearStoredCallState();
        cleanupConnection();
    };

    const leaveCall = (source = 'unspecified') => {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        const partnerUserId =
            localStorage.getItem('activePartnerUserId') || localStorage.getItem('tempCallerUserId');
        const callId = localStorage.getItem('tempCallId') || null;
        const leaveCallEvent = getLeaveCallEvent({
            socket,
            partnerUserId,
            callId,
            callAccepted: callAcceptedRef.current,
        });
        const willEmitCancelled = leaveCallEvent?.event === SOCKET_EVENTS.CALL_REJECT;

        console.log('[CALL_DIAG][client:leaveCall]', {
            source,
            socketId: socket?.id,
            partnerUserId,
            callId,
            callAccepted: callAcceptedRef.current,
            callState: callStateRef.current,
            willEmitRejectCancelled: willEmitCancelled,
        });

        if (leaveCallEvent) {
            socket.emit(leaveCallEvent.event, leaveCallEvent.payload);
        }

        clearStoredCallState();
        cleanupConnection();
    };

    return { callUser, answerCall, rejectCall, leaveCall, clearStoredCallState, makePeer };
};
