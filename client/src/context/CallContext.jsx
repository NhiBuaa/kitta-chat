import React, { createContext, useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { useSocket } from "./SocketContext.js";
import Peer from "simple-peer";

const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket } = useSocket() || {};

    // --- SỬA QUAN TRỌNG 1: State lưu ID của chính mình ---
    const [me, setMe] = useState("");
    // ----------------------------------------------------

    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);

    // Lấy tên người dùng
    const [myAppName] = useState(() => {
        try {
            const userString = localStorage.getItem('user');
            if (userString) {
                const user = JSON.parse(userString);
                return user.displayName || user.username || "Người dùng";
            }
        } catch (error) { 
            console.error("Lỗi parse user:", error);
        }
        return "Người dùng";
    });

    const connectionRef = useRef();

    // Hàm xin quyền media (Giữ nguyên logic thông minh đã sửa trước đó)
    const getMediaStream = async () => {
        try {
            const currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(currentStream);
            return currentStream;
        } catch (error) {
            console.error("Lỗi media:", error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                toast.error("⛔ Bạn đã chặn quyền Camera/Micro. Vui lòng mở khóa trên thanh địa chỉ!");
            } else {
                toast.error("Vui lòng cấp quyền Camera/Micro để gọi video!");
            }
            return null;
        }
    };

    // --- SỬA QUAN TRỌNG 2: useEffect lắng nghe ID ---
    useEffect(() => {
        if (!socket) return;

        // Cách 1: Nếu socket đã connect sẵn rồi (Trường hợp load nhanh)
        if (socket.connected && socket.id) {
            console.log("✅ Socket đã có sẵn ID:", socket.id);
            setTimeout(() => {
                setMe(socket.id);
            }, 0);
        }

        // Cách 2: Lắng nghe sự kiện "me" từ server (Chuẩn nhất)
        socket.on("me", (id) => {
            console.log("✅ Server gửi ID về:", id);
            setMe(id);
        });

        // Cách 3: Lắng nghe sự kiện connect mặc định
        socket.on("connect", () => {
            console.log("✅ Socket vừa kết nối xong, ID là:", socket.id);
            setMe(socket.id);
        });

        // Lắng nghe cuộc gọi đến
        socket.on("callUser", (data) => {
            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                signal: data.signal
            });
        });

        socket.on("callEnded", () => {
            setCallEnded(true);
            if (connectionRef.current) connectionRef.current.destroy();
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                setStream(null);
            }
            window.location.reload();
        });

        return () => {
            socket.off("me");
            socket.off("connect");
            socket.off("callUser");
            socket.off("callEnded");
        };
    }, [socket, stream]);


    // --- SỬA QUAN TRỌNG 3: Dùng biến 'me' thay vì socket.id ---
    const answerCall = async () => {
        const currentStream = await getMediaStream();
        if (!currentStream) return;

        setCallAccepted(true);

        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream: currentStream
        });

        peer.on("signal", (data) => {
            // Gửi signal trả lời
            socket.emit("answerCall", { signal: data, to: call.from });
        });

        peer.on("stream", (currentStream) => {
            setRemoteStream(currentStream);
        });

        peer.signal(call.signal);
        connectionRef.current = peer;
    };

    const callUser = async (id) => {
        // Kiểm tra chắc chắn đã có ID chưa
        if (!me) {
            // Thử lấy lại lần cuối từ socket object
            if (socket?.id) {
                setMe(socket.id);
            } else {
                toast.error("Chưa kết nối xong tới máy chủ gọi điện. Vui lòng đợi 2s và thử lại!");
                console.error("❌ callUser thất bại: ID của tôi (me) vẫn là undefined");
                return;
            }
        }

        const currentStream = await getMediaStream();
        if (!currentStream) return;

        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: currentStream
        });

        peer.on("signal", (data) => {
            // Gửi signal gọi đi
            // QUAN TRỌNG: Dùng biến me hoặc socket.id trực tiếp ở đây cho chắc chắn
            const myId = me || socket.id;

            console.log(`📡 Đang gọi tới ${id} từ ${myId}`);

            socket.emit("callUser", {
                userToCall: id,
                signalData: data,
                from: myId, // Dùng ID đã lấy được
                name: myAppName
            });
        });

        peer.on("stream", (currentStream) => {
            setRemoteStream(currentStream);
        });

        socket.on("callAccepted", (signal) => {
            setCallAccepted(true);
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    const leaveCall = () => {
        setCallEnded(true);
        if (connectionRef.current) connectionRef.current.destroy();

        const destination = call?.from;
        if (destination && socket) {
            socket.emit("endCall", { to: destination });
        }

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        window.location.reload();
    };

    return (
        <CallContext.Provider value={{
            call, callAccepted,
            stream,
            remoteStream,
            callEnded, leaveCall, answerCall, callUser,
            name: myAppName,
            me // Export thêm me nếu cần debug
        }}>
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };