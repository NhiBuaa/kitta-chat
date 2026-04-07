import Peer from 'simple-peer';
import { toast } from 'react-toastify';
import { CALL_STATES } from './CallStates';
import { ICE_SERVERS } from './constants';
import { clearCallStorage } from './callStorage';

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
        peer.on('error', onError ?? (() => leaveCall()));
        peer.on('close', () => {
            if (callStateRef.current === CALL_STATES.CONNECTED) leaveCall();
        });
        return peer;
    };

    // ─── Actions ──────────────────────────────────────────────────────────────
    const callUser = (receiverUserId, localStream, isCamOn = true, isMicOn = true, callType = 'video') => {
        const userStr = localStorage.getItem('user');
        const freshUser = userStr ? JSON.parse(userStr) : null;
        if (!freshUser) { toast.error('Phiên đăng nhập hết hạn.'); return; }
        if (!receiverUserId || !localStream) return;
        if (!socket?.id) { toast.error('Mất kết nối máy chủ.'); return; }

        updateStream(localStream);
        localStreamRef.current = localStream;
        setCallAccepted(false);
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
        socket.emit('initCall', { userToCall: receiverUserId, typeCall: callType, callId: tempCallId, from: socket.id });

        const peer = makePeer({
            initiator: true,
            stream: localStream,
            onSignal: (data) => {
                socket.emit('callUser', {
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

        socket.off('callAccepted');
        socket.once('callAccepted', (payload) => {
            clearTimeout(callTimeoutRef.current);
            const signal = payload?.signal || payload;
            setCallAccepted(true);
            setCallEnded(false);
            setCallState(CALL_STATES.CONNECTED);
            callStateRef.current = CALL_STATES.CONNECTED;
            if (payload?.mediaStatus) setPartnerMediaStatus(payload.mediaStatus);
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
        setCallEnded(false);
        setCallState(CALL_STATES.CONNECTED);
        callStateRef.current = CALL_STATES.CONNECTED;
        updateStream(currentStream);

        const peer = makePeer({
            initiator: false,
            stream: currentStream,
            onSignal: (data) => {
                socket.emit('answerCall', {
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
            socket.emit('rejectCall', { to: callerUserId, callId, reason: 'rejected' });
        }
        setCall((prev) => ({ ...prev, isReceivingCall: false }));
        clearStoredCallState();
        cleanupConnection();
    };

    const leaveCall = () => {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        const partnerUserId =
            localStorage.getItem('activePartnerUserId') || localStorage.getItem('tempCallerUserId');
        const callId = localStorage.getItem('tempCallId') || null;

        if (socket && partnerUserId) {
            // Dùng ref để tránh stale closure
            if (!callAcceptedRef.current) {
                if (callId) socket.emit('rejectCall', { to: partnerUserId, callId, reason: 'cancelled' });
            } else {
                if (callId) socket.emit('endCall', { to: partnerUserId, callId });
            }
        }

        clearStoredCallState();
        cleanupConnection();
    };

    return { callUser, answerCall, rejectCall, leaveCall, clearStoredCallState, makePeer };
};