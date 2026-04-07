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
        // Check and reset dangling states from previous session
        queueMicrotask(() => {
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
                // Clear all call-related localStorage
                [
                    "activePartnerUserId", "tempCallerId", "tempCallerUserId",
                    "tempCallSignal", "tempCallerMediaStatus", "tempCallType",
                    "callStartTime", "tempCallId"
                ].forEach(key => localStorage.removeItem(key));
            }
        });
    }, []);

    // On-Startup Validation: Reset stale call states
    useEffect(() => {
        queueMicrotask(() => {
            // Check if there's a dangling call state from a session that didn't cleanup properly
            const callStartTime = parseInt(localStorage.getItem("callStartTime") || "0", 10);
            const now = Date.now();
            const age = callStartTime > 0 ? now - callStartTime : 0;
            
            // Nếu call state cũ nhưng hơn 2 phút, xóa nó (definitely stale)
            if (age > 2 * 60 * 1000) {
                console.log("[CallContext] Startup: Detected stale call state (age: " + Math.floor(age / 1000) + "s) - resetting");
                [
                    "activePartnerUserId", "tempCallerId", "tempCallerUserId",
                    "tempCallSignal", "tempCallerMediaStatus", "tempCallType",
                    "callStartTime", "tempCallId"
                ].forEach(key => localStorage.removeItem(key));
                
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
            }
        });
    }, []);

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    };

    const callUser = (receiverUserId, localStream, isCamOn = true, isMicOn = true, callType = "video") => {
        console.log(`[CallContext] callUser START: receiverId=${receiverUserId}, streamExists=${!!localStream}`);
        
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
        
        // Generate temp callId ngay và lưu vào localStorage trước khi peer signal
        // Điều này đảm bảo callId sẵn sàng nếu A bấm end trước khi server phản hồi outgoingCallCreated
        const tempCallId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem("tempCallId", tempCallId);
        setCallId(tempCallId);
        console.log(`[CallContext] Generated and saved tempCallId: ${tempCallId}`);

        localStorage.setItem("activePartnerUserId", receiverUserId);
        localStorage.setItem("callStartTime", new Date().getTime().toString());

        // CRITICAL: Emit initCall event IMMEDIATELY (before peer signal)
        // This ensures server creates the call record RIGHT NOW with tempCallId mapping
        // If A cancels before peer.on("signal"), server still has the record
        socket.emit("initCall", {
            userToCall: receiverUserId,
            typeCall: callType,
            callId: tempCallId,
            from: socket.id
        });
        console.log(`[CallContext] Emitted initCall with tempCallId=${tempCallId}`);

        // Client-side timeout đã bỏ — dùng timeout từ BE qua event "callTimeout"

        const peer = new Peer({ initiator: true, trickle: false, stream: localStream, config: ICE_SERVERS });

        peer.on("signal", (data) => {
            console.log(`[CallContext] peer.on(signal) fired, emitting callUser with callId=${tempCallId}`);
            socket.emit("callUser", {
                userToCall: receiverUserId,
                signalData: data,
                from: socket.id,
                callerDbId: freshUser._id || freshUser.id,
                mediaStatus: { cam: isCamOn, mic: isMicOn },
                typeCall: callType,
                callId: tempCallId
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

        console.log(`[CallContext] leaveCall: callAccepted=${callAccepted}, callId=${callId}, partnerUserId=${partnerUserId}`);

        if (socket && partnerUserId) {
            // Nếu call chưa được pick up (callAccepted=false) → gọi reject để B nhận "missed"
            // Nếu call đã được answer (callAccepted=true) → gọi endCall để kết thúc
            if (!callAccepted) {
                if (callId) {
                    console.log("[CallContext] Caller canceled before answer - emit rejectCall with callId");
                    socket.emit("rejectCall", { to: partnerUserId, callId, reason: "cancelled" });
                } else {
                    console.warn("[CallContext] Caller canceled but callId is NULL - CANNOT reject properly!");
                }
            } else {
                if (callId) {
                    console.log("[CallContext] Caller leaving active call - emit endCall");
                    socket.emit("endCall", { to: partnerUserId, callId });
                } else {
                    console.warn("[CallContext] Caller leaving but callId is NULL - CANNOT end call properly!");
                }
            }
        } else {
            console.log(`[CallContext] leaveCall: socket or partnerUserId missing, socket=${!!socket}, partnerUserId=${partnerUserId}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            
            // Check nếu thực sự đang trong cuộc gọi active (không phải stale state)
            // Stale state: state is CONNECTED but peer/remoteStream không còn
            const isCallActive = 
                connectionRef.current && 
                remoteStream && 
                remoteStream.getTracks().length > 0;
            
            const callStartTimeForCheck = parseInt(localStorage.getItem("callStartTime") || "0", 10);
            const now = Date.now();
            const callAge = now - callStartTimeForCheck;
            
            // Nếu state là CONNECTED/RINGING nhưng call cũ >10s AND không có active peer → coi như outdated
            const isStateStale = 
                callAge > 10000 && callAge > 0 && !isCallActive;
            
            // Case 1: Detect stale state → force reset và tiếp tục xử lý incoming call (không reject)
            if (isStateStale) {
                console.log("[CallContext] Incoming call while in stale state - auto-reset", { callAge: callAge / 1000, isCallActive });
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                // NOT rejecting server - continue processing this call normally
            }
            // Case 2: Truly active call → reject incoming
            else if (callStateRef.current === CALL_STATES.CONNECTED || callStateRef.current === CALL_STATES.RINGING) {
                console.log("[CallContext] Reject incoming call: Already in active call (state:", callStateRef.current, ")");
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

        const handleCallRejected = ({ reason } = {}) => {
            console.log(`[CallContext] Nhận được sự kiện callRejected từ server, reason: ${reason}`);
            
            setIsCalling(false);
            
            // Nếu là "cancelled" (caller hủy trước khi pick up), không hiển thị toast
            if (reason !== "cancelled") {
                toast.info("Người dùng bận hoặc từ chối.");
            }
            
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket]);

    // Cleanup on window unload/pagehide (handle popup/window close)
    // Also sync state when storage changes (from other tabs/popups)
    useEffect(() => {
        const handleWindowClose = () => {
            // Khi popup CallPage đóng, signal main window để reset state
            if (callStateRef.current !== CALL_STATES.IDLE) {
                console.log("[CallContext] Window close detected - cleanup call state");
                localStorage.removeItem("callStartTime");
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                cleanupConnection();
            }
        };

        // Detect when callStartTime is removed (means call ended in another window/tab)
        const handleStorageChange = (e) => {
            if (e.key === "callStartTime" && e.newValue === null && callStateRef.current !== CALL_STATES.IDLE) {
                console.log("[CallContext] Detected callStartTime cleared in another window - syncing state");
                setCallState(CALL_STATES.IDLE);
                setCallEnded(true);
                cleanupConnection();
            }
        };

        window.addEventListener("pagehide", handleWindowClose);
        window.addEventListener("beforeunload", handleWindowClose);
        window.addEventListener("storage", handleStorageChange);

        return () => {
            window.removeEventListener("pagehide", handleWindowClose);
            window.removeEventListener("beforeunload", handleWindowClose);
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

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
