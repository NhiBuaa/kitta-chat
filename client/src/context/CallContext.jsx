import React, { createContext, useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useSocket } from "./SocketContext.js";
import Peer from "simple-peer";
import * as process from "process";
window.global = window;
window.process = process;
window.Buffer = [];

const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket, onlineUsers } = useSocket();

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
    const [isCalling, setIsCalling] = useState(false);
    const [me, setMe] = useState("");
    const [partnerMediaStatus, setPartnerMediaStatus] = useState({ cam: true, mic: true });

    const myVideo = useRef();
    const userVideo = useRef();
    const connectionRef = useRef();
    const streamRef = useRef(null);

    const updateStream = (newStream) => {
        streamRef.current = newStream;
        setStream(newStream);
    };

    const getPartnerSocketId = () => {
        const savedSocketId = localStorage.getItem('activePartnerSocketId');

        const partnerUserId = localStorage.getItem('activePartnerUserId');

        if (partnerUserId && Array.isArray(onlineUsers)) {
            const found = onlineUsers.find(u => u.userId === partnerUserId);
            if (found) {
                console.log(`[getPartnerSocketId] Tìm thấy socket mới nhất cho userId ${partnerUserId}:`, found.socketId);
                return found.socketId;
            }
        }

        // Fallback: dùng socket ID đã lưu
        console.log(`[getPartnerSocketId] Dùng savedSocketId:`, savedSocketId);
        return savedSocketId;
    };

    const cleanupConnection = () => {
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        setStream(null);
        setRemoteStream(null);
        setCallEnded(true);
        setCallAccepted(false);
        setIsCalling(false);
        setCall({});
    };

    // --- HÀM GỌI ĐI ---
    const callUser = async (receiverSocketId, localStream, receiverUserId = null) => {
        const userStr = localStorage.getItem('user');
        const freshUser = userStr ? JSON.parse(userStr) : null;

        if (!freshUser) { toast.error("Phiên đăng nhập hết hạn."); return; }
        if (!receiverSocketId || !localStream) { console.error("Thiếu thông tin để gọi"); return; }
        if (!socket?.id) { toast.error("Mất kết nối máy chủ."); return; }

        updateStream(localStream);
        setCallAccepted(false);
        setCallEnded(false);
        setIsCalling(true);
        setCall(prev => ({ ...prev, userToCall: receiverSocketId }));

        localStorage.setItem('activePartnerSocketId', receiverSocketId);
        if (receiverUserId) {
            localStorage.setItem('activePartnerUserId', receiverUserId);
        }

        const peer = new Peer({ initiator: true, trickle: false, stream: localStream });

        peer.on("signal", (data) => {
            socket.emit("callUser", {
                userToCall: receiverSocketId,
                signalData: data,
                from: socket.id,
                name: freshUser.displayName || "Người dùng",
                callerDbId: freshUser.id
            });
        });

        peer.on("stream", (currentRemoteStream) => {
            setRemoteStream(currentRemoteStream);
            if (userVideo.current) userVideo.current.srcObject = currentRemoteStream;
        });

        peer.on("error", (err) => { console.error("Peer Error:", err); leaveCall(); });

        socket.once("callAccepted", (signal) => {
            setCallAccepted(true);
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    // --- HÀM TRẢ LỜI ---
    const answerCall = (currentStream) => {
        const callerId = localStorage.getItem('tempCallerId') || call.from;
        const callerUserId = localStorage.getItem('tempCallerUserId');
        const savedSignal = localStorage.getItem('tempCallSignal');

        if (!savedSignal || !callerId || savedSignal === "undefined") {
            toast.error("Mất tín hiệu cuộc gọi.");
            return false;
        }

        localStorage.setItem('activePartnerSocketId', callerId);
        if (callerUserId) {
            localStorage.setItem('activePartnerUserId', callerUserId);
        }

        const signalToUse = JSON.parse(savedSignal);
        setCallAccepted(true);
        updateStream(currentStream);

        const peer = new Peer({ initiator: false, trickle: false, stream: currentStream });

        peer.on("signal", (data) => {
            socket.emit("answerCall", { signal: data, to: callerId });
        });

        peer.on("stream", (currentRemoteStream) => {
            setRemoteStream(currentRemoteStream);
            if (userVideo.current) userVideo.current.srcObject = currentRemoteStream;
        });

        peer.on("error", (err) => { console.error("Peer Error:", err); leaveCall(); });

        peer.signal(signalToUse);
        connectionRef.current = peer;

        setTimeout(() => {
            localStorage.removeItem('tempCallSignal');
            localStorage.removeItem('tempCallerId');
            localStorage.removeItem('tempCallerUserId');
        }, 2000);

        return true;
    };

    // --- HÀM KẾT THÚC ---
    const leaveCall = () => {
        const partnerSocketId = getPartnerSocketId();

        if (socket && partnerSocketId) {
            console.log("[leaveCall] Gửi endCall tới socket:", partnerSocketId);
            socket.emit("endCall", { to: partnerSocketId });
        } else {
            console.warn("[leaveCall] Không tìm được socket ID của đối phương!");
        }

        cleanupConnection();

        localStorage.removeItem('activePartnerSocketId');
        localStorage.removeItem('activePartnerUserId');
        localStorage.removeItem('tempCallerId');
        localStorage.removeItem('tempCallerUserId');
        localStorage.removeItem('tempCallSignal');
    };

    // --- LẮNG NGHE SOCKET ---
    useEffect(() => {
        if (!socket) return;

        socket.on("me", (id) => setMe(id));

        socket.on("callUser", (data) => {
            console.log("[Socket] Nhận cuộc gọi:", data);
            const validSignal = data.signal || data.signalData;

            localStorage.setItem('tempCallerId', data.from);           // socket ID của caller
            localStorage.setItem('tempCallSignal', JSON.stringify(validSignal));
            if (data.callerDbId) {
                localStorage.setItem('tempCallerUserId', data.callerDbId);
            }

            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                avatar: data.avatar,
                signal: validSignal
            });
        });

        socket.on("callEnded", () => {
            console.log("[Socket] Đối phương đã tắt máy, đang cleanup...");
            cleanupConnection();
            localStorage.removeItem('activePartnerSocketId');
            localStorage.removeItem('activePartnerUserId');
            localStorage.removeItem('tempCallerId');
            localStorage.removeItem('tempCallerUserId');
            localStorage.removeItem('tempCallSignal');
        });

        socket.on("callRejected", () => {
            setIsCalling(false);
            toast.info("Người dùng bận hoặc từ chối.");
            cleanupConnection();
        });

        socket.on("updateMediaStatus", ({ cam, mic }) => {
            setPartnerMediaStatus({ cam, mic });
        });

        return () => {
            socket.off("me");
            socket.off("callUser");
            socket.off("callEnded");
            socket.off("callRejected");
            socket.off("updateMediaStatus");
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
                partnerMediaStatus
            }}
        >
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };