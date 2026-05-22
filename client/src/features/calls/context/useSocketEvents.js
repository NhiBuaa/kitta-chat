import { useEffect } from 'react';
import Peer from 'simple-peer';
import { toast } from 'react-toastify';
import { CALL_STATES } from '@/features/calls/context/CallStates.js';
import { ICE_SERVERS } from '@/features/calls/context/constants.js';
import { persistPartnerMediaStatus } from '@/features/calls/context/callMediaState.js';
import { getStoredUser } from '@/services/auth/authSession.js';

/**
 * Đăng ký / hủy toàn bộ socket event listeners liên quan đến cuộc gọi.
 * Không chứa logic state riêng — chỉ phối hợp bag + actions.
 */
export const useSocketEvents = ({ socket, bag, actions }) => {
    const {
        callStateRef, isPreparingCallRef, isOutgoingCallRef,
        mySocketIdRef, isGlareWaitingRef, glareWinnerDataRef,
        isGlareLoserRef, glareLoserPartnerRef,
        connectionRef, callTimeoutRef, localStreamRef, userVideo,
        remoteStream,
        setMe, setCallState, setCallEnded,
        setIsCalling, setCall, setCallId, setPartnerMediaStatus,
        setRemoteStream, setIsPreparingCall, cleanupConnection,
    } = bag;

    const { leaveCall, answerCall, clearStoredCallState, makePeer } = actions;

    useEffect(() => {
        if (!socket) return;

        // ── me ───────────────────────────────────────────────────────────────
        const handleMe = (id) => {
            setMe(id);
            mySocketIdRef.current = id;
        };

        // ── callUser (incoming) ──────────────────────────────────────────────
        const handleIncomingCall = (data) => {
            const callerId = data.callerDbId;
            let loggedInUserId = null;
            try {
                const storedUser = getStoredUser();
                loggedInUserId = storedUser?._id || storedUser?.id || null;
            } catch {
                loggedInUserId = null;
            }
            console.log('[CALL_DIAG][client:callUser:received]', {
                loggedInUserId,
                socketId: socket?.id,
                callerId,
                callerSocketId: data.from,
                callId: data.callId || null,
                clientCallId: localStorage.getItem('tempCallId'),
                pathname: window.location.pathname,
                callState: callStateRef.current,
            });

            // Nếu đang mở popup CallPage thì tự đóng, không xử lý tiếp
            if (window.location.pathname.includes('/call') && callStateRef.current === CALL_STATES.IDLE) {
                window.close();
                return;
            }

            // ── Glare detection ───────────────────────────────────────────────
            const activeTarget = localStorage.getItem('activePartnerUserId');
            const callStartTime = parseInt(localStorage.getItem('callStartTime') || '0', 10);
            const isRecent = Date.now() - callStartTime < 45_000;
            const amICallingThem =
                (callStateRef.current === CALL_STATES.CALLING && String(activeTarget) === String(callerId)) ||
                (isRecent && String(activeTarget) === String(callerId));

            if (amICallingThem) {
                if (mySocketIdRef.current > data.from) {
                    _handleGlareWinner({ data, callerId, socket, bag, leaveCall });
                } else {
                    _handleGlareLoser({ data, callerId, bag, answerCall });
                }
                return;
            }

            // ── Pre-call popup đang mở ────────────────────────────────────────
            if (isPreparingCallRef.current) setIsPreparingCall(false);

            // Lưu callId sớm để rejectCall luôn có callId
            if (data.callId) localStorage.setItem('tempCallId', data.callId);

            // ── Kiểm tra stale state / busy / glare loser chờ winner ──────────
            const isCallActive = connectionRef.current && remoteStream?.getTracks().length > 0;
            const callAge = Date.now() - parseInt(localStorage.getItem('callStartTime') || '0', 10);
            const isStateStale = callAge > 10_000 && callAge > 0 && !isCallActive;

            if (isStateStale) {
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                // Tiếp tục xử lý cuộc gọi mới (không return)
            } else if (isGlareLoserRef.current && String(callerId) === String(glareLoserPartnerRef.current)) {
                isGlareLoserRef.current = false;
                glareLoserPartnerRef.current = null;
                if (localStreamRef.current) {
                    const isCamOn = localStreamRef.current.getVideoTracks()[0]?.enabled ?? false;
                    const isMicOn = localStreamRef.current.getAudioTracks()[0]?.enabled ?? true;
                    setTimeout(() => answerCall(localStreamRef.current, isCamOn, isMicOn), 50);
                }
                return;
            } else if (
                callStateRef.current === CALL_STATES.CONNECTED ||
                callStateRef.current === CALL_STATES.RINGING
            ) {
                socket.emit('rejectCall', { to: callerId, callId: data.callId || null, reason: 'Người dùng đang bận.' });
                return;
            }

            // ── Nhận cuộc gọi bình thường ─────────────────────────────────────
            const validSignal = data.signal || data.signalData;
            const incomingCallType = data.typeCall || 'video';

            localStorage.setItem('tempCallerId', data.from);
            localStorage.setItem('tempCallSignal', JSON.stringify(validSignal));
            localStorage.setItem('tempCallType', incomingCallType);
            if (data.callId) {
                localStorage.setItem('tempCallId', data.callId);
                setCallId(data.callId);
            }
            if (data.callerDbId) {
                localStorage.setItem('tempCallerUserId', data.callerDbId);
                localStorage.setItem('activePartnerUserId', data.callerDbId);
            }
            localStorage.setItem('tempCallerMediaStatus', JSON.stringify(data.mediaStatus || { cam: true, mic: true }));

            setPartnerMediaStatus(data.mediaStatus || { cam: true, mic: true });
            setCallEnded(false);
            setCallState(CALL_STATES.RINGING);
            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                avatar: data.avatar,
                signal: validSignal,
                callType: incomingCallType,
                callId: data.callId || null,
            });
        };

        // ── callEnded ─────────────────────────────────────────────────────────
        const handleCallEnded = () => {
            setCallEnded(true);
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            cleanupConnection();
            clearStoredCallState();
        };

        // ── callTimeout ───────────────────────────────────────────────────────
        const handleCallTimeout = ({ callId: timeoutCallId }) => {
            const currentCallId = localStorage.getItem('tempCallId');
            if (timeoutCallId && currentCallId && timeoutCallId !== currentCallId) return;
            toast.error('Không có phản hồi từ đối phương.');
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            cleanupConnection();
            clearStoredCallState();
        };

        // ── callRejected ──────────────────────────────────────────────────────
        const handleCallRejected = ({ reason } = {}) => {
            setIsCalling(false);
            if (reason !== 'cancelled') toast.info('Người dùng bận hoặc từ chối.');
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            cleanupConnection();
            clearStoredCallState();
        };

        // ── updateMediaStatus ─────────────────────────────────────────────────
        const handleUpdateMediaStatus = ({ cam, mic }) => {
            const mediaStatus = { cam, mic };
            persistPartnerMediaStatus(mediaStatus);
            setPartnerMediaStatus(mediaStatus);
        };

        // ── outgoingCallCreated ───────────────────────────────────────────────
        const handleOutgoingCallCreated = ({ callId: createdCallId, userToCall }) => {
            if (!createdCallId) return;
            setCallId(createdCallId);
            localStorage.setItem('tempCallId', createdCallId);
            if (userToCall) localStorage.setItem('activePartnerUserId', userToCall);
        };

        // ── callHistorySync ───────────────────────────────────────────────────
        const handleCallHistorySync = (data) => {
            if (data.callId && data.direction === 'outgoing') setCallId(data.callId);
        };

        // ── glare (server báo: tôi là Winner, chờ Loser offer) ───────────────
        const handleGlare = (data) => {
            isGlareWaitingRef.current = true;
            glareWinnerDataRef.current = data;
        };

        // ── glareLost (server báo: tôi là Loser, phải accept Winner) ─────────
        const handleGlareLost = (data) => {
            const { winnerDbId, winnerSignal, myCallId, typeCall } = data;

            if (connectionRef.current) {
                try { connectionRef.current.destroy(); } catch { /* noop */ }
                connectionRef.current = null;
            }
            if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
            }

            setIsCalling(false);
            isOutgoingCallRef.current = false;
            isGlareLoserRef.current = true;
            glareLoserPartnerRef.current = winnerDbId;

            localStorage.setItem('tempCallerUserId', winnerDbId);
            localStorage.setItem('tempCallSignal', JSON.stringify(winnerSignal));
            localStorage.setItem('tempCallType', typeCall || 'video');
            localStorage.setItem('activePartnerUserId', winnerDbId);
            setPartnerMediaStatus({ cam: true, mic: true });

            if (socket && myCallId) {
                socket.emit('rejectCall', { to: winnerDbId, callId: myCallId, reason: 'cancelled' });
            }

            // Loser tạo initiator peer gửi offer cho Winner
            if (localStreamRef.current) {
                const user = getStoredUser();
                const peer = makePeer({
                    initiator: true,
                    stream: localStreamRef.current,
                    onSignal: (myOfferSignal) => {
                        socket.emit('callUser', {
                            userToCall: winnerDbId,
                            signalData: myOfferSignal,
                            from: socket.id,
                            callerDbId: user?._id || null,
                            mediaStatus: {
                                cam: localStreamRef.current.getVideoTracks()[0]?.enabled ?? false,
                                mic: localStreamRef.current.getAudioTracks()[0]?.enabled ?? true,
                            },
                            typeCall: typeCall || 'video',
                            callId: `temp_${Date.now()}_glare`,
                        });
                    },
                    onStream: (remote) => {
                        setRemoteStream(remote);
                        if (userVideo.current) userVideo.current.srcObject = remote;
                    },
                });
                connectionRef.current = peer;
            }
        };

        // ── Register / Cleanup ────────────────────────────────────────────────
        const events = {
            me: handleMe,
            callUser: handleIncomingCall,
            callEnded: handleCallEnded,
            callTimeout: handleCallTimeout,
            callRejected: handleCallRejected,
            updateMediaStatus: handleUpdateMediaStatus,
            outgoingCallCreated: handleOutgoingCallCreated,
            callHistorySync: handleCallHistorySync,
            glare: handleGlare,
            glareLost: handleGlareLost,
        };

        Object.entries(events).forEach(([event, handler]) => socket.on(event, handler));
        return () => Object.entries(events).forEach(([event, handler]) => socket.off(event, handler));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket]);
};

// ─── Private helpers (glare branches) ────────────────────────────────────────

function _handleGlareWinner({ data, callerId, socket, bag, leaveCall }) {
    const {
        isGlareWaitingRef, glareWinnerDataRef,
        connectionRef, callTimeoutRef, localStreamRef, userVideo,
        callStateRef, isOutgoingCallRef,
        setCallAccepted, setCallEnded, setCallState, setIsCalling, setRemoteStream,
    } = bag;

    if (!isGlareWaitingRef.current || !glareWinnerDataRef.current) return; // lag/duplicate → bỏ qua

    isGlareWaitingRef.current = false;
    glareWinnerDataRef.current = null;

    if (connectionRef.current) {
        try { connectionRef.current.destroy(); } catch { /* noop */ }
        connectionRef.current = null;
    }
    if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
    }

    if (!localStreamRef.current) return;

    const validSignal = data.signal || data.signalData;
    const peer = new Peer({ initiator: false, trickle: false, stream: localStreamRef.current, config: ICE_SERVERS });

    peer.on('signal', (answerSignal) => {
        socket.emit('answerCall', {
            to: callerId,
            signal: answerSignal,
            mediaStatus: {
                cam: localStreamRef.current.getVideoTracks()[0]?.enabled ?? false,
                mic: localStreamRef.current.getAudioTracks()[0]?.enabled ?? true,
            },
            callId: data.callId || null,
        });
    });

    peer.on('stream', (remote) => {
        setRemoteStream(remote);
        if (userVideo.current) userVideo.current.srcObject = remote;
        setCallAccepted(true);
        setCallEnded(false);
        setCallState(CALL_STATES.CONNECTED);
        callStateRef.current = CALL_STATES.CONNECTED;
    });

    peer.on('error', () => leaveCall('glareWinner:peer:error'));
    peer.on('close', () => {
        if (callStateRef.current === CALL_STATES.CONNECTED) leaveCall('glareWinner:peer:close-connected');
    });

    peer.signal(validSignal);
    connectionRef.current = peer;
    setCallState(CALL_STATES.CONNECTED);
    callStateRef.current = CALL_STATES.CONNECTED;
    setIsCalling(false);
    isOutgoingCallRef.current = true;
}

function _handleGlareLoser({ data, callerId, bag, answerCall }) {
    const {
        callStateRef, connectionRef, callTimeoutRef, localStreamRef,
        isOutgoingCallRef,
        setIsCalling, setCallState,
        setPartnerMediaStatus,
    } = bag;

    if (callStateRef.current !== CALL_STATES.CALLING) return;

    if (connectionRef.current) {
        try { connectionRef.current.destroy(); } catch { /* noop */ }
        connectionRef.current = null;
    }
    if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
    }

    setIsCalling(false);
    isOutgoingCallRef.current = false;
    setCallState(CALL_STATES.CONNECTED);
    callStateRef.current = CALL_STATES.CONNECTED;

    const validSignal = data.signal || data.signalData;
    localStorage.setItem('tempCallerUserId', callerId);
    localStorage.setItem('tempCallSignal', JSON.stringify(validSignal));
    localStorage.setItem('tempCallType', data.typeCall || 'video');
    setPartnerMediaStatus(data.mediaStatus || { cam: true, mic: true });

    if (localStreamRef.current) {
        const isCamOn = localStreamRef.current.getVideoTracks()[0]?.enabled ?? true;
        const isMicOn = localStreamRef.current.getAudioTracks()[0]?.enabled ?? true;
        setTimeout(() => answerCall(localStreamRef.current, isCamOn, isMicOn), 100);
    }
}
