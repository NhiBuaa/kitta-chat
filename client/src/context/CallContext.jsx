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
    const { socket } = useSocket();

    // KHAI BÁO STATE & REF ---
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

    // --- HÀM GỌI ĐI  ---
    const callUser = async (receiverSocketId, localStream) => {
        // Kiểm tra User từ LocalStorage
        const userStr = localStorage.getItem('user');
        const freshUser = userStr ? JSON.parse(userStr) : null;

        if (!freshUser) {
            toast.error("Phiên đăng nhập hết hạn.");
            return;
        }

        if (!receiverSocketId || !localStream) {
            console.error("Thiếu thông tin để gọi:", { receiverSocketId, localStream });
            return;
        }

        const mySocketId = socket?.id;
        if (!mySocketId) {
            toast.error("Mất kết nối máy chủ.");
            return;
        }

        // Cập nhật State
        setStream(localStream);
        setCallAccepted(false);
        setCallEnded(false);
        setIsCalling(true);

        // Lưu ID đối phương
        setCall(prev => ({ ...prev, userToCall: receiverSocketId }));
        localStorage.setItem('activePartnerSocketId', receiverSocketId);

        // Tạo Peer
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: localStream
        });

        peer.on("signal", (data) => {
            socket.emit("callUser", {
                userToCall: receiverSocketId,
                signalData: data,
                from: mySocketId,
                name: freshUser.displayName || "Người dùng",
                callerDbId: freshUser.id
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

        socket.once("callAccepted", (signal) => {
            setCallAccepted(true);
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    // --- HÀM TRẢ LỜI ---
    const answerCall = (currentStream) => {
        // Ưu tiên đọc từ LocalStorage
        const callerId = localStorage.getItem('tempCallerId') || call.from;
        const savedSignal = localStorage.getItem('tempCallSignal');

        // Nếu không có trong LocalStorage thì thử tìm trong State
        if (!savedSignal || !callerId) {
            toast.error("Mất tín hiệu cuộc gọi.");
            return false;
        }

        localStorage.setItem('activePartnerSocketId', callerId);

        console.log("🔍 Debug AnswerCall:", { callerId, hasSignal: !!savedSignal });

        if (!savedSignal || !callerId || savedSignal === "undefined") {
            toast.error("Lỗi tín hiệu. Không thể kết nối.");
            return false;
        }

        const signalToUse = JSON.parse(savedSignal);
        setCallAccepted(true);

        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream: currentStream,
        });

        peer.on("signal", (data) => {
            socket.emit("answerCall", { signal: data, to: callerId });
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

        // Dọn dẹp LocalStorage
        setTimeout(() => {
            localStorage.removeItem('tempCallSignal');
            localStorage.removeItem('tempCallerId');
        }, 2000);

        return true;
    };

    // --- HÀM KẾT THÚC ---
    const leaveCall = () => {
        const partnerId = localStorage.getItem('activePartnerSocketId');

        if (socket && partnerId) {
            console.log("Tín hiệu kết thúc gửi tới:", partnerId);
            socket.emit("endCall", { to: partnerId });
        }

        // Ngắt kết nối Peer
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }

        // Tắt camera/mic
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        // Dọn dẹp bộ nhớ
        setCallEnded(true);
        cleanupConnection();
        localStorage.removeItem('activePartnerSocketId');
    };

    const cleanupConnection = () => {
        if (connectionRef.current) connectionRef.current.destroy();
    };

    // --- LẮNG NGHE SOCKET ---
    useEffect(() => {
        if (!socket) return;

        socket.on("me", (id) => setMe(id));

        socket.on("callUser", (data) => {
            console.log("[Socket] Nhận cuộc gọi:", data);

            const validSignal = data.signal || data.signalData;

            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                avatar: data.avatar,
                signal: validSignal
            });
        });

        socket.on("callEnded", () => {
            setCallEnded(true);

            if (connectionRef.current) {
                connectionRef.current.destroy();
            }
            console.log("Đối phương đã tắt máy");
            window.localStream?.getTracks().forEach(track => track.stop());
            cleanupConnection();
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
            socket.off("callUser");
            socket.off("callEnded");
            socket.off("callRejected");
            socket.off("updateMediaStatus");
        }
    }, [socket]);

    return (
        <CallContext.Provider
            value={{
                call,
                callAccepted,
                myVideo,
                userVideo,
                stream,
                setStream,
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