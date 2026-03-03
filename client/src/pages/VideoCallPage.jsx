import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa';
import { useSocket } from '../context/SocketContext';
import { CallContext } from '../context/CallContext';
import { toast } from 'react-toastify';
import { useContext } from 'react';

const VideoCallPage = () => {
    const { partnerId } = useParams();
    const [searchParams] = useSearchParams();

    // Lấy thông tin người nhận từ URL
    const partnerName = searchParams.get('name') || "Người dùng";
    const partnerAvatar = searchParams.get('avatar') || "";

    const [stream, setStream] = useState(null);
    const myVideo = useRef();

    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [isCalling, setIsCalling] = useState(false);

    const { callUser } = useContext(CallContext);
    const { onlineUsers } = useSocket();

    // LẤY STREAM CAMERA NGAY KHI VÀO TRANG
    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((currentStream) => {
                setStream(currentStream);
                if (myVideo.current) {
                    myVideo.current.srcObject = currentStream;
                }
            })
            .catch((err) => {
                console.error("Không thể truy cập camera:", err);
                alert("Vui lòng cấp quyền Camera và Micro để tiếp tục!");
            });

        // Cleanup khi đóng tab
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // Toggle Mic
    const toggleMic = () => {
        if (stream) {
            stream.getAudioTracks()[0].enabled = !micOn;
            setMicOn(!micOn);
        }
    };

    // Toggle Camera
    const toggleCam = () => {
        if (stream) {
            stream.getVideoTracks()[0].enabled = !camOn;
            setCamOn(!camOn);
        }
    };

    // HÀM BẮT ĐẦU GỌI
    const handleStartCall = () => {
        console.log("Danh sách online hiện tại:", onlineUsers);

        let targetSocketId = null;

        if (Array.isArray(onlineUsers)) {
            const partner = onlineUsers.find(u => u.userId === partnerId);
            if (partner) targetSocketId = partner.socketId;
        }

        if (!targetSocketId) {
            toast.error("Người dùng này hiện không online (hoặc chưa tải xong danh sách).");
            console.error("Không tìm thấy socketId cho userId:", partnerId);
            return;
        }

        setIsCalling(true);

        // Gọi hàm logic kết nối socket cũ của bạn
        // truyền stream hiện tại vào hàm callUser
        callUser({
            id: partnerId,
            displayName: partnerName,
            socketId: targetSocketId
        }, stream);
    };

    return (
        <div className="flex h-screen w-screen bg-[#1c1c1c] text-white overflow-hidden">

            {/* --- CỘT TRÁI: PREVIEW CAMERA --- */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-gray-700">
                <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                    {/* Video Preview */}
                    <video
                        playsInline
                        muted
                        ref={myVideo}
                        autoPlay
                        className={`w-full h-full object-cover transform scale-x-[-1] ${!camOn ? 'hidden' : ''}`}
                    />

                    {/* Fallback khi tắt cam */}
                    {!camOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 flex-col">
                            <FaVideoSlash size={25} className="text-gray-500 mb-3" />

                            {/* Dòng chữ bên dưới */}
                            <span className="text-gray-400 text-sm font-medium">
                                Máy ảnh đang tắt
                            </span>
                        </div>
                    )}

                    {/* Toolbar Controls bên dưới video */}
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex space-x-4 bg-gray-900/80 px-6 py-3 rounded-full backdrop-blur-md">
                        <button onClick={toggleCam} className={`p-3 rounded-full transition ${camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
                            {camOn ? <FaVideo /> : <FaVideoSlash />}
                        </button>
                        <button onClick={toggleMic} className={`p-3 rounded-full transition ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
                            {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- CỘT PHẢI: THÔNG TIN NGƯỜI NHẬN & NÚT GỌI --- */}
            <div className="w-[400px] flex flex-col items-center justify-center bg-[#1c1c1c] p-8">
                {/* Avatar người nhận */}
                <div className="mb-6 relative">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700 shadow-xl">
                        <img
                            src={partnerAvatar || "https://via.placeholder.com/150"}
                            alt={partnerName}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>

                <h2 className="text-2xl font-bold mb-2">{partnerName}</h2>
                <p className="text-gray-400 mb-10">Sẵn sàng để gọi?</p>

                {/* NÚT START CALL */}
                {!isCalling ? (
                    <button
                        onClick={handleStartCall}
                        className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full text-lg shadow-lg transform transition active:scale-95 w-full max-w-[200px]"
                    >
                        Bắt đầu cuộc gọi
                    </button>
                ) : (
                    <div className="text-blue-400 animate-pulse font-semibold">
                        Đang kết nối...
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoCallPage;