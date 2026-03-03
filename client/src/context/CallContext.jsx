import React, { createContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useSocket } from "./SocketContext.js";
import Peer from "simple-peer";

const CallContext = createContext();

export const CallProvider = ({ children }) => {
    const { socket } = useSocket() || {};
    const API_URL = import.meta.env.VITE_API_URL;

    // STATE
    const [me, setMe] = useState("");
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [call, setCall] = useState({});
    const [callAccepted, setCallAccepted] = useState(false);
    const [callEnded, setCallEnded] = useState(false);
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
    const [currentUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user'));
        } catch (error) {
            console.log("Lỗi parse user:", error);
            return null;
        }
    })

    // REF
    const connectionRef = useRef();
    const startTimeRef = useRef(null);

    // --- HÀM HELPFUL ---
    // Hàm xin quyền media
    const getMediaStream = async () => {
        try {
            const currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(currentStream);
            return currentStream;
        } catch (error) {
            console.error("Lỗi media:", error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                toast.error("Bạn đã chặn quyền Camera/Micro. Vui lòng mở khóa trên thanh địa chỉ!");
            } else {
                toast.error("Vui lòng cấp quyền Camera/Micro để gọi video!");
            }
            return null;
        }
    };

    const getFreshUser = () => {
        try {
            const userStr = localStorage.getItem('user');

            if (userStr) {
                return JSON.parse(userStr);
            }
        } catch (error) {
            console.error("Lỗi đọc user từ storage:", error);
        }
        return null;
    };

    // Hàm dọn dẹp media và kết nối
    const resetCallState = () => {
        if (stream) {
            stream.getTracks().forEach(track => { track.stop(); track.enabled = false; });
        }
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }
        setStream(null);
        setRemoteStream(null);
        setCall({});
        setCallAccepted(false);
        setCallEnded(false);
        startTimeRef.current = null;
    };

    // Hàm format thời gian
    const formatDuration = (startTime) => {
        if (!startTime) return "00:00";
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        return `${minutes} phút ${seconds} giây`;
    };

    // GỬI TIN NHẮN HỆ THỐNG
    const sendSystemMessage = async (text, receiverId) => {
        // 1. Lấy user trực tiếp từ LocalStorage để tránh bị undefined/stale state
        let user = currentUser;
        if (!user || !user._id) {
            try {
                const userStr = localStorage.getItem('user');
                if (userStr) user = JSON.parse(userStr);
            } catch (e) {
                console.error("Lỗi parse user từ storage", e);
            }
        }

        // 2. Kiểm tra lại lần nữa
        if (!user || !user._id || !receiverId) {
            console.error("❌ sendSystemMessage thất bại: Thiếu ID", {
                currentUserId: user?._id,
                receiverId
            });
            return;
        }

        console.log("📤 Gửi tin hệ thống:", text, "->", receiverId);

        const messagePayload = {
            sender: user._id, // Dùng biến user vừa lấy được
            receiver: receiverId,
            text: text,
            type: 'system',
            isGroup: false
        };

        try {
            const res = await axios.post(`${API_URL}/api/messages`, messagePayload, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });

            if (socket) {
                socket.emit("sendMessage", {
                    ...messagePayload,
                    _id: res.data._id,
                    createdAt: res.data.createdAt || new Date().toISOString(),
                    senderId: user._id,
                    receiverId: receiverId,
                    sender: {
                        _id: user._id,
                        displayName: user.displayName,
                        avatar: user.avatar
                    }
                });
            }
        } catch (error) {
            console.error("❌ Lỗi API tin nhắn:", error);
        }
    };

    // --- lắng nghe sự kiện từ server ---
    useEffect(() => {
        if (!socket) return;

        // Nếu socket đã connect sẵn rồi
        if (socket.connected && socket.id) {
            console.log("Socket đã có sẵn ID:", socket.id);
            setTimeout(() => {
                setMe(socket.id);
            }, 0);
        }

        //  Lắng nghe sự kiện "me" từ server
        socket.on("me", (id) => {
            console.log("Server gửi ID về:", id);
            setMe(id);
        });

        // Lắng nghe sự kiện connect mặc định
        socket.on("connect", () => {
            console.log("Socket vừa kết nối xong, ID là:", socket.id);
            setMe(socket.id);
        });

        // Lắng nghe cuộc gọi đến ( người nhận)
        socket.on("callUser", (data) => {
            setCall({
                isReceivingCall: true,
                from: data.from,
                name: data.name,
                signal: data.signal,
                partnerDbId: data.callerDbId
            });
        });

        // Kết thúc cuộc gọi (Khi đang nói chuyện)
        socket.on("callEnded", () => {
            setCallEnded(true);

            if (startTimeRef.current) {
                const duration = formatDuration(startTimeRef.current);
                toast.info(`Cuộc gọi kết thúc. Thời lượng: ${duration}`);
            } else {
                toast.info("Cuộc gọi đã kết thúc.");
            }

            resetCallState();
        });

        // Lắng nghe cuộc gọi bị từ chối ( người nhận ấn từ chối)
        socket.on("callRejected", () => {
            toast.info("Cuộc gọi đã bị từ chối.");
            resetCallState();
        })

        // Lắng nghe cuộc gọi bị hủy ( người gọi ấn kết thúc trước khi người nhận trả lời)
        socket.on("callCancelled", () => {
            setCall({});
            toast.info("Cuộc gọi đã bị hủy.");
            resetCallState();
        })

        return () => {
            socket.off("me");
            socket.off("connect");
            socket.off("callUser");
            socket.off("callEnded");
            socket.off("callRejected");
            socket.off("callCancelled")
        };
    }, [socket, stream]);


    // --- CÁC HÀM XỬ LÝ CUỘC GỌI ---
    // Người nhận trả lời cuộc gọi
    const answerCall = async () => {
        const currentStream = await getMediaStream();
        if (!currentStream) return;

        startTimeRef.current = Date.now();

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

    // Người gọi thực hiện cuộc gọi
    const callUser = async (receiverData, existingStream = null) => {
        // Kiểm tra User Tươi
        const freshUser = getFreshUser();
        if (!freshUser) {
            toast.error("Bạn chưa đăng nhập hoặc phiên làm việc hết hạn.");
            return;
        }

        const id = receiverData.socketId; // Socket ID người nhận
        const name = receiverData.displayName;
        const dbId = receiverData._id || receiverData.id;

        // Kiểm tra Socket ID của người nhận
        // Lưu ý: Nếu mở Tab mới, bạn cần đảm bảo receiverData có chứa socketId mới nhất của đối phương
        if (!id) {
            toast.error("Không tìm thấy người dùng online để gọi.");
            console.error("Thiếu socketId người nhận", receiverData);
            return;
        }

        // Kiểm tra Socket ID của mình
        const mySocketId = me || socket?.id;
        if (!mySocketId) {
            toast.error("Chưa kết nối tới máy chủ. Vui lòng thử lại sau giây lát.");
            return;
        }

        // XỬ LÝ MEDIA STREAM
        let currentStream = existingStream;
        if (!currentStream) {
            currentStream = await getMediaStream();
        }

        if (!currentStream) {
            return;
        }

        // Cập nhật ngay state Stream để hiển thị video của mình lên màn hình
        setStream(currentStream);

        // Cập nhật trạng thái cuộc gọi
        setCall({
            isReceivingCall: false,
            userToCall: id,
            partnerDbId: dbId,
            name: name,
            from: mySocketId
        });

        // Khởi tạo Peer (WebRTC)
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: currentStream
        });

        peer.on("signal", (data) => {
            console.log(`📡 Đang gửi tín hiệu gọi tới ${id} từ ${mySocketId}`);

            // Gửi qua Socket
            socket.emit("callUser", {
                userToCall: id,
                signalData: data,
                from: mySocketId,
                name: myAppName || freshUser.displayName,
                callerDbId: freshUser._id
            });
        });

        peer.on("stream", (remoteStream) => {
            console.log("Đã nhận được stream từ đối phương");
            setRemoteStream(remoteStream);
        });

        peer.on("error", (err) => {
            console.error("Peer error:", err);
            toast.error("Lỗi kết nối WebRTC");
            leaveCall(); // Tự động ngắt nếu lỗi
        });

        // Lắng nghe khi bên kia chấp nhận
        socket.on("callAccepted", (signal) => {
            setCallAccepted(true);
            peer.signal(signal);
        });

        connectionRef.current = peer;
    };

    // Từ chối cuộc gọi
    const rejectCall = () => {
        if (call?.from) {
            socket.emit("rejectCall", { to: call.from });
        }
        setCall({});
    }

    // Kết thúc cuộc gọi dùng cho cả 2 bên
    const leaveCall = () => {
        setCallEnded(true);

        const otherDbId = call.partnerDbId;
        const otherSocketId = call.isReceivingCall ? call.from : call.userToCall;

        // Tính toán thời gian cuộc gọi và gửi tin nhắn hệ thống
        if (otherDbId) {
            if (startTimeRef.current) {
                const duration = formatDuration(startTimeRef.current);
                sendSystemMessage(`Cuộc gọi kết thúc - ${duration}`, otherDbId);
            } else {
                const msg = call.isReceivingCall ? "Đã từ chối cuộc gọi" : "Cuộc gọi bị hủy";
                sendSystemMessage(msg, otherDbId);
            }
        } else {
            console.error("Không tìm thấy partnerDbId để lưu tin nhắn");
        }

        // Gửi socket ngắt kết nối
        if (otherSocketId) {
            socket.emit("endCall", { to: otherSocketId });
        }

        resetCallState();
        setCall({});
        setCallAccepted(false);
    };

    return (
        <CallContext.Provider value={{
            call, callAccepted,
            stream,
            remoteStream,
            callEnded, leaveCall, answerCall, callUser,
            name: myAppName,
            me,
            rejectCall
        }}>
            {children}
        </CallContext.Provider>
    );
};

export { CallContext };