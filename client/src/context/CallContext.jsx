import React, { createContext, useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import { toast } from "react-toastify";
import { useSocket } from "./SocketContext.js";
import { CALL_STATES } from './CallStates';

window.global = window;
window.process = {
    env: { DEBUG: undefined },
    version: "",
    nextTick: (cb) => setTimeout(cb, 0),
};
window.Buffer = window.Buffer || [];

const CallContext = createContext();
const CALL_STORAGE_MAX_AGE_MS = 2 * 60 * 1000;

export const CallProvider = ({ children }) => {
    const { socket } = useSocket();

    const [callState, setCallState] = useState(CALL_STATES.IDLE);
    const callStateRef = useRef(callState);
    useEffect(() => { callStateRef.current = callState; }, [callState]);

    const [isPreparingCall, setIsPreparingCall] = useState(false);
    const isPreparingCallRef = useRef(isPreparingCall);
    useEffect(() => { isPreparingCallRef.current = isPreparingCall; }, [isPreparingCall]);

    const isOutgoingCallRef = useRef(false);
    const mySocketIdRef = useRef("");

    const getStoredPartnerMediaStatus = () => {
        const storedStatus = localStorage.getItem("tempCallerMediaStatus");
        if (!storedStatus) return { cam: true, mic: true };
        try {
            return JSON.parse(storedStatus);
        } catch (error) {
            console.log("Lỗi phân tích trạng thái media đối phương:", error);
            return { cam: true, mic: true };
        }
    };

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
    const [callId, setCallId] = useState(null); // Lưu callId từ server
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
    const [isCalling, setIsCalling] = useState(false);
    const [me, setMe] = useState("");
    const [partnerMediaStatus, setPartnerMediaStatus] = useState(() => getStoredPartnerMediaStatus());

    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef(null);
    const streamRef = useRef(null);
    const callTimeoutRef = useRef(null);
    const localStreamRef = useRef(null);

    const updateStream = (newStream) => {
        streamRef.current = newStream;
        setStream(newStream);
    };

    const clearStoredCallState = () => {
        localStorage.removeItem("activePartnerUserId");
        localStorage.removeItem("tempCallerId");
        localStorage.removeItem("tempCallerUserId");
        localStorage.removeItem("tempCallSignal");
        localStorage.removeItem("tempCallerMediaStatus");
        localStorage.removeItem("tempCallType");
        localStorage.removeItem("callStartTime");
        localStorage.removeItem("tempCallId");
        setCallId(null);
    };

    const cleanupConnection = () => {
        if (connectionRef.current) {
            try { connectionRef.current.destroy(); } catch { /* loop */ }
            connectionRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (window.localStream) {
            window.localStream.getTracks().forEach((track) => { try { track.stop() } catch { /* loop */ } });
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

    useEffect(() => {
        const startedAtRaw = localStorage.getItem("callStartTime");
        const startedAt = Number.parseInt(startedAtRaw || "0", 10);
        const hasDanglingCallState =
            Boolean(localStorage.getItem("tempCallId")) ||
            Boolean(localStorage.getItem("activePartnerUserId")) ||
            Boolean(localStorage.getItem("tempCallerUserId")) ||
            Boolean(localStorage.getItem("tempCallerId")) ||
            Boolean(localStorage.getItem("tempCallSignal"));

        const isExpired = startedAt > 0 && (Date.now() - startedAt > CALL_STORAGE_MAX_AGE_MS);
        const hasBrokenState =
            Boolean(localStorage.getItem("tempCallId")) &&
            !localStorage.getItem("activePartnerUserId") &&
            !localStorage.getItem("tempCallerUserId") &&
            !localStorage.getItem("tempCallerId");

        if ((hasDanglingCallState && isExpired) || hasBrokenState) {
            clearStoredCallState();
        }
    }, []);

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    };

    const callUser = (receiverUserId, localStream, isCamOn = true, isMicOn = true, callType = "video") => {
        const userStr = localStorage.getItem("user");
        const freshUser = userStr ? JSON.parse(userStr) : null;
        if (!freshUser) { toast.error("Phiên đăng nhập hết hạn."); return; }
        if (!receiverUserId || !localStream) return;
        if (!socket?.id) { toast.error("Mất kết nối máy chủ."); return; }

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
        setCallId(null);

        localStorage.setItem("activePartnerUserId", receiverUserId);
        localStorage.setItem("callStartTime", new Date().getTime().toString());

        // Client-side timeout đã bỏ — dùng timeout từ BE qua event "callTimeout"

        const peer = new Peer({ initiator: true, trickle: false, stream: localStream, config: ICE_SERVERS });

        peer.on("signal", (data) => {
            socket.emit("callUser", {
                userToCall: receiverUserId,
                signalData: data,
                from: socket.id,
                callerDbId: freshUser._id || freshUser.id,
                mediaStatus: { cam: isCamOn, mic: isMicOn },
                typeCall: callType
            });
        });

        peer.on("stream", (currentRemoteStream) => {
            setRemoteStream(currentRemoteStream);
            if (userVideo.current) {
                userVideo.current.srcObject = currentRemoteStream;
            }
        });

        peer.on("error", (err) => {
            console.error("Peer Error:", err);
            leaveCall();
        });

        // Thêm monitoring cho peer close/disconnect
        peer.on("close", () => {
            console.log("[CallContext] Peer connection closed by other side");
            if (callStateRef.current === CALL_STATES.CONNECTED && !callEnded) {
                leaveCall();
            }
        });

        const handleCallAccepted = (payload) => {
            clearTimeout(callTimeoutRef.current);
            const signal = payload?.signal || payload;
            const acceptedMediaStatus = payload?.mediaStatus;

            setCallAccepted(true);
            setCallEnded(false);
            setCallState(CALL_STATES.CONNECTED);
            callStateRef.current = CALL_STATES.CONNECTED;

            if (acceptedMediaStatus) {
                setPartnerMediaStatus(acceptedMediaStatus);
            }

            peer.signal(signal);
        };

        socket.off("callAccepted");
        socket.once("callAccepted", handleCallAccepted);
        connectionRef.current = peer;
    };

    const answerCall = (currentStream, isCamOn = true, isMicOn = true) => {
        const callerUserId = localStorage.getItem("tempCallerUserId");
        const savedSignal = localStorage.getItem("tempCallSignal");

        if (!savedSignal || !callerUserId || savedSignal === "undefined") {
            toast.error("Mất tín hiệu cuộc gọi.");
            return false;
        }

        localStreamRef.current = currentStream;
        localStorage.setItem("activePartnerUserId", callerUserId);

        const signalToUse = JSON.parse(savedSignal);
        setCallAccepted(true);
        setCallEnded(false);
        setCallState(CALL_STATES.CONNECTED);
        callStateRef.current = CALL_STATES.CONNECTED;
        updateStream(currentStream);

        const peer = new Peer({ initiator: false, trickle: false, stream: currentStream, config: ICE_SERVERS });

        peer.on("signal", (data) => {
            socket.emit("answerCall", {
                signal: data,
                to: callerUserId,
                mediaStatus: { cam: isCamOn, mic: isMicOn },
                callId: localStorage.getItem("tempCallId") || null,
            });
        });

        peer.on("stream", (currentRemoteStream) => {
            setRemoteStream(currentRemoteStream);
            if (userVideo.current) {
                userVideo.current.srcObject = currentRemoteStream;
            }
        });

        peer.on("error", (err) => {
            console.error("Peer Error:", err);
            leaveCall();
        });

        // Thêm monitoring cho peer close/disconnect
        peer.on("close", () => {
            console.log("[CallContext] Peer connection closed by other side");
            if (callStateRef.current === CALL_STATES.CONNECTED && !callEnded) {
                leaveCall();
            }
        });

        peer.signal(signalToUse);
        connectionRef.current = peer;

        setTimeout(() => {
            localStorage.removeItem("tempCallSignal");
            localStorage.removeItem("tempCallerId");
            localStorage.removeItem("tempCallerUserId");
        }, 2000);

        return true;
    };

    const rejectCall = () => {
        const callerUserId =
            localStorage.getItem("tempCallerUserId") ||
            localStorage.getItem("tempCallerId");
        const callId = localStorage.getItem("tempCallId") || null;

        if (socket && callerUserId) {
            socket.emit("rejectCall", { to: callerUserId, callId, reason: "rejected" });
        }

        setCall((prev) => ({ ...prev, isReceivingCall: false }));
        clearStoredCallState();
        cleanupConnection();
    };

    const leaveCall = () => {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        const partnerUserId =
            localStorage.getItem("activePartnerUserId") ||
            localStorage.getItem("tempCallerUserId");
        const callId = localStorage.getItem("tempCallId") || null;

        if (socket && partnerUserId) {
            socket.emit("endCall", { to: partnerUserId, callId });
        }

        clearStoredCallState();
        cleanupConnection();
    };

    // Watchdog: Giám sát kết nối Peer và tự động đóng nếu kết nối bị ngắt
    useEffect(() => {
        if (!callAccepted || callEnded || !connectionRef.current) return;

        const watchdogInterval = setInterval(() => {
            if (!connectionRef.current) {
                console.warn("[CallContext] Watchdog: Peer connection không tồn tại, đóng cuộc gọi");
                leaveCall();
                return;
            }

            // Kiểm tra xem có remote stream không
            if (!remoteStream || remoteStream.getTracks().length === 0) {
                const callStartTime = parseInt(localStorage.getItem("callStartTime") || "0", 10);
                const callDuration = Date.now() - callStartTime;
                
                // Chỉ cảnh báo nếu cuộc gọi đã kéo dài ít nhất 5 giây (tránh false positive lúc khởi tạo)
                if (callDuration > 5000) {
                    console.warn("[CallContext] Watchdog: Remote stream mất, auto-closing call");
                    leaveCall();
                }
            }
        }, 3000); // Check mỗi 3 giây

        return () => clearInterval(watchdogInterval);
    }, [callAccepted, callEnded, remoteStream]);

    useEffect(() => {
        if (!socket) return;

        const handleMe = (id) => { setMe(id); mySocketIdRef.current = id; };

        const handleIncomingCall = (data) => {
            const callerId = data.callerDbId;

            if (window.location.pathname.includes('/call') && callStateRef.current === CALL_STATES.IDLE) {
                console.log("Đang mở Popup Pre-call thì có cuộc gọi tới. Tự động tắt Popup!");
                window.close();
                return;
            }

            // ==========================================
            // PERFECT NEGOTIATION & CROSS-TAB SYNC
            // ==========================================
            const activeTarget = localStorage.getItem("activePartnerUserId");
            const callStartTime = parseInt(localStorage.getItem("callStartTime") || "0", 10);
            const isRecent = (Date.now() - callStartTime) < 45000;

            const amICallingThem =
                (callStateRef.current === CALL_STATES.CALLING && String(activeTarget) === String(callerId)) ||
                (isRecent && String(activeTarget) === String(callerId));

            if (amICallingThem) {
                if (mySocketIdRef.current > data.from) {
                    console.log("Call Glare: WINNER. Bỏ qua tín hiệu đến.");
                    return;
                } else {
                    console.log("Call Glare: LOSER. Đang xử lý tự động kết nối.");

                    if (callStateRef.current !== CALL_STATES.CALLING) {
                        return;
                    }

                    if (connectionRef.current) {
                        try { connectionRef.current.destroy(); } catch { /* loop */ }
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
                    const incomingCallType = data.typeCall || "video";

                    localStorage.setItem("tempCallerUserId", callerId);
                    localStorage.setItem("tempCallSignal", JSON.stringify(validSignal));
                    localStorage.setItem("tempCallType", incomingCallType);
                    setPartnerMediaStatus(data.mediaStatus || { cam: true, mic: true });

                    if (localStreamRef.current) {
                        const isCamOn = localStreamRef.current.getVideoTracks()[0]?.enabled ?? true;
                        const isMicOn = localStreamRef.current.getAudioTracks()[0]?.enabled ?? true;
                        setTimeout(() => answerCall(localStreamRef.current, isCamOn, isMicOn), 100);
                    }
                    return;
                }
            }

            // ==========================================
            // PRE-CALL POPUP
            // ==========================================
            if (isPreparingCallRef.current) {
                setIsPreparingCall(false);
            }

            // ==========================================
            // NGƯỜI THỨ 3 GỌI KHI ĐANG BẬN
            // ==========================================
            // Lưu callId TRƯỚC check busy để rejectCall có callId ngay
            if (data.callId) {
                localStorage.setItem("tempCallId", data.callId);
            }
            if (callStateRef.current === CALL_STATES.CONNECTED || callStateRef.current === CALL_STATES.RINGING) {
                socket.emit("rejectCall", { to: callerId, callId: data.callId || null, reason: "Người dùng đang bận." });
                return;
            }

            // ==========================================
            // NHẬN CUỘC GỌI BÌNH THƯỜNG
            // ==========================================
            const validSignal = data.signal || data.signalData;
            const incomingCallType = data.typeCall || "video";

            localStorage.setItem("tempCallerId", data.from);
            localStorage.setItem("tempCallSignal", JSON.stringify(validSignal));
            localStorage.setItem("tempCallType", incomingCallType);

            // Lưu callId ngay để cả "busy" block lẫn answer/reject đều có thể dùng
            if (data.callId) {
                localStorage.setItem("tempCallId", data.callId);
                setCallId(data.callId);
            }

            if (data.callerDbId) {
                localStorage.setItem("tempCallerUserId", data.callerDbId);
                localStorage.setItem("activePartnerUserId", data.callerDbId);
            }

            localStorage.setItem(
                "tempCallerMediaStatus",
                JSON.stringify(data.mediaStatus || { cam: true, mic: true })
            );
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

        const handleCallEnded = () => {
            console.log("[CallContext] Nhận được sự kiện callEnded từ server");
            // Đặt trạng thái cuộc gọi kết thúc ngay lập tức
            setCallEnded(true);
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            
            // Dọn dẹp kết nối và lưu trữ
            cleanupConnection();
            clearStoredCallState();
            
            console.log("[CallContext] Hoàn tất xử lý callEnded");
        };

        const handleCallTimeout = ({ callId: timeoutCallId }) => {
            const currentCallId = localStorage.getItem("tempCallId");
            if (timeoutCallId && currentCallId && timeoutCallId !== currentCallId) return;
            toast.error("Không có phản hồi từ đối phương.");
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            cleanupConnection();
            clearStoredCallState();
        };

        const handleCallRejected = () => {
            setIsCalling(false);
            toast.info("Người dùng bận hoặc từ chối.");
            setCall((prev) => ({ ...prev, isReceivingCall: false }));
            cleanupConnection();
            clearStoredCallState();
        };

        const handleUpdateMediaStatus = ({ cam, mic }) => {
            setPartnerMediaStatus({ cam, mic });
        };

        const handleOutgoingCallCreated = ({ callId: createdCallId, userToCall }) => {
            if (!createdCallId) return;
            setCallId(createdCallId);
            localStorage.setItem("tempCallId", createdCallId);
            if (userToCall) {
                localStorage.setItem("activePartnerUserId", userToCall);
            }
        };

        // Lưu callId từ server khi nhận callHistorySync (outgoing call)
        const handleCallHistorySync = (data) => {
            if (data.callId && data.direction === "outgoing") {
                setCallId(data.callId);
            }
        };

        socket.on("me", handleMe);
        socket.on("callUser", handleIncomingCall);
        socket.on("callEnded", handleCallEnded);
        socket.on("callTimeout", handleCallTimeout);
        socket.on("callRejected", handleCallRejected);
        socket.on("updateMediaStatus", handleUpdateMediaStatus);
        socket.on("outgoingCallCreated", handleOutgoingCallCreated);
        socket.on("callHistorySync", handleCallHistorySync);

        return () => {
            socket.off("me", handleMe);
            socket.off("callUser", handleIncomingCall);
            socket.off("callEnded", handleCallEnded);
            socket.off("callTimeout", handleCallTimeout);
            socket.off("callRejected", handleCallRejected);
            socket.off("updateMediaStatus", handleUpdateMediaStatus);
            socket.off("outgoingCallCreated", handleOutgoingCallCreated);
            socket.off("callHistorySync", handleCallHistorySync);
        };
    }, [socket]);

    return (
        <CallContext.Provider
            value={{
                call, callAccepted, callState, isPreparingCall, setIsPreparingCall,
                myVideo, userVideo, stream, setStream: updateStream, callEnded,
                me, callUser, answerCall, leaveCall, rejectCall, isCalling,
                setCall, remoteStream, partnerMediaStatus, callId, setCallId,
            }}
        >
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };
