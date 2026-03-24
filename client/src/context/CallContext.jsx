import React, { createContext, useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import { toast } from "react-toastify";
import { useSocket } from "./SocketContext.js";

window.global = window;
window.process = {
    env: { DEBUG: undefined },
    version: "",
    nextTick: (cb) => setTimeout(cb, 0),
};
window.Buffer = window.Buffer || [];

const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket } = useSocket();

    const getStoredPartnerMediaStatus = () => {
        const storedStatus = localStorage.getItem("tempCallerMediaStatus");
        if (!storedStatus) return { cam: true, mic: true };

        try {
            return JSON.parse(storedStatus);
        } catch (error) {
            console.error("Failed to parse stored partner media status:", error);
            return { cam: true, mic: true };
        }
    };

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
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
    };

    const cleanupConnection = () => {
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        setStream(null);
        setRemoteStream(null);
        setPartnerMediaStatus({ cam: true, mic: true });
        setCallAccepted(false);
        setIsCalling(false);
        setCall({});
        setCallEnded(true);
    };

    // BỔ SUNG: Cấu hình STUN Server (Để xuyên tường lửa 4G)
    // Sau này nếu có kinh phí, bạn chèn thêm TURN Server của Twilio/Metered vào mảng này
    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    };

    const callUser = (receiverUserId, localStream, isCamOn = true, isMicOn = true) => {
        const userStr = localStorage.getItem("user");
        const freshUser = userStr ? JSON.parse(userStr) : null;

        if (!freshUser) {
            toast.error("Phien dang nhap het han.");
            return;
        }

        if (!receiverUserId || !localStream) {
            console.error("Thieu thong tin de goi.");
            return;
        }

        if (!socket?.id) {
            toast.error("Mat ket noi may chu.");
            return;
        }

        updateStream(localStream);
        setCallAccepted(false);
        setCallEnded(false);
        setIsCalling(true);
        setPartnerMediaStatus({ cam: true, mic: true });
        setCall((prev) => ({ ...prev, userToCall: receiverUserId }));

        localStorage.setItem("activePartnerUserId", receiverUserId);

        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = setTimeout(() => {
            toast.error("Không có phản hồi từ đối phương.");
            leaveCall();
        }, 45000);

        const peer = new Peer({ initiator: true, trickle: false, stream: localStream, config: ICE_SERVERS });

        peer.on("signal", (data) => {
            socket.emit("callUser", {
                userToCall: receiverUserId,
                signalData: data,
                from: socket.id,
                name: freshUser.displayName || "Người dùng",
                callerDbId: freshUser._id || freshUser.id,
                mediaStatus: { cam: isCamOn, mic: isMicOn },
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

        const handleCallAccepted = (payload) => {
            clearTimeout(callTimeoutRef.current);
            const signal = payload?.signal || payload;
            const acceptedMediaStatus = payload?.mediaStatus;

            setCallAccepted(true);
            setCallEnded(false);

            if (acceptedMediaStatus) {
                setPartnerMediaStatus(acceptedMediaStatus);
            }

            peer.signal(signal);
        };

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

        localStorage.setItem("activePartnerUserId", callerUserId);

        const signalToUse = JSON.parse(savedSignal);
        setCallAccepted(true);
        setCallEnded(false);
        updateStream(currentStream);

        const peer = new Peer({ initiator: false, trickle: false, stream: currentStream, config: ICE_SERVERS });

        peer.on("signal", (data) => {
            socket.emit("answerCall", {
                signal: data,
                to: callerUserId,
                mediaStatus: { cam: isCamOn, mic: isMicOn },
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

        peer.signal(signalToUse);
        connectionRef.current = peer;

        setTimeout(() => {
            localStorage.removeItem("tempCallSignal");
            localStorage.removeItem("tempCallerId");
            localStorage.removeItem("tempCallerUserId");
        }, 2000);

        return true;
    };

    const leaveCall = () => {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        const partnerUserId =
            localStorage.getItem("activePartnerUserId") ||
            localStorage.getItem("tempCallerUserId");

        if (socket && partnerUserId) {
            socket.emit("endCall", { to: partnerUserId });
        }

        clearStoredCallState();
        cleanupConnection();
    };

    useEffect(() => {
        if (!socket) return;

        const handleMe = (id) => setMe(id);

        const handleIncomingCall = (data) => {
            const validSignal = data.signal || data.signalData;

            localStorage.setItem("tempCallerId", data.from);
            localStorage.setItem("tempCallSignal", JSON.stringify(validSignal));

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
            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                avatar: data.avatar,
                signal: validSignal,
            });
        };

        const handleCallEnded = () => {
            cleanupConnection();
            clearStoredCallState();
        };

        const handleCallRejected = () => {
            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            setIsCalling(false);
            toast.info("Người dùng bận hoặc từ chối.");
            cleanupConnection();
            clearStoredCallState();
        };

        const handleUpdateMediaStatus = ({ cam, mic }) => {
            setPartnerMediaStatus({ cam, mic });
        };

        socket.on("me", handleMe);
        socket.on("callUser", handleIncomingCall);
        socket.on("callEnded", handleCallEnded);
        socket.on("callRejected", handleCallRejected);
        socket.on("updateMediaStatus", handleUpdateMediaStatus);

        return () => {
            socket.off("me", handleMe);
            socket.off("callUser", handleIncomingCall);
            socket.off("callEnded", handleCallEnded);
            socket.off("callRejected", handleCallRejected);
            socket.off("updateMediaStatus", handleUpdateMediaStatus);
        };
    }, [socket]);

    return (
        <CallContext.Provider
            value={{
                call,
                callAccepted,
                myVideo,
                userVideo,
                stream,
                setStream: updateStream,
                callEnded,
                me,
                callUser,
                answerCall,
                leaveCall,
                isCalling,
                setCall,
                remoteStream,
                partnerMediaStatus,
            }}
        >
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };
