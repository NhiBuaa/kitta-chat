import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhoneSlash } from 'react-icons/fa';
import { useSocket } from '../context/SocketContext';
import { CallContext } from '../context/CallContext';
import { toast } from 'react-toastify';

const VideoCallPage = () => {
    const { partnerId } = useParams();
    const [searchParams] = useSearchParams();

    const isIncoming = searchParams.get('incoming') === 'true';
    const urlName = searchParams.get('name') || "Người dùng";
    const urlAvatar = searchParams.get('avatar');

    const partnerAvatar = (urlAvatar && urlAvatar !== "undefined" && urlAvatar !== "null")
        ? urlAvatar
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(urlName)}&background=random`;

    const { socket, onlineUsers, currentUser } = useSocket();

    const {
        callUser, answerCall, leaveCall,
        callAccepted, callEnded,
        myVideo, setCall,
        remoteStream, partnerMediaStatus, call
    } = useContext(CallContext);

    const myVideoFull = useRef();
    const userVideoFull = useRef();

    const [stream, setLocalStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [isJoined, setIsJoined] = useState(false);

    const notifyMediaChange = (newCam, newMic) => {
        const targetId =
            localStorage.getItem('activePartnerUserId') ||
            localStorage.getItem('activePartnerSocketId') ||
            call.from ||
            localStorage.getItem('tempCallerId');

        console.log('[notifyMediaChange] emit toggleMedia tới:', targetId, { cam: newCam, mic: newMic });

        if (socket && targetId) {
            socket.emit("toggleMedia", { to: targetId, cam: newCam, mic: newMic });
        } else {
            console.warn('[notifyMediaChange] Không tìm được targetId!');
        }
    };

    const toggleMic = () => {
        if (stream) {
            const newStatus = !micOn;
            stream.getAudioTracks()[0].enabled = newStatus;
            setMicOn(newStatus);
            notifyMediaChange(camOn, newStatus);
        }
    };

    const toggleCam = () => {
        if (stream) {
            const newStatus = !camOn;
            stream.getVideoTracks()[0].enabled = newStatus;
            setCamOn(newStatus);
            notifyMediaChange(newStatus, micOn);
        }
    };

    const handleJoinCall = () => {
        if (!socket || !stream) {
            toast.warn("Vui lòng đợi kết nối...");
            return;
        }

        if (isIncoming) {
            const success = answerCall(stream);
            if (success) setIsJoined(true);
        } else {
            let targetSocketId = null;
            let targetUserId = partnerId;

            if (Array.isArray(onlineUsers)) {
                const partner = onlineUsers.find(u => u.userId === partnerId);
                if (partner) {
                    targetSocketId = partner.socketId;
                }
            }

            if (!targetSocketId && partnerId.length < 24) {
                targetSocketId = partnerId;
                targetUserId = null;
            }

            if (targetSocketId) {
                callUser(targetSocketId, stream, targetUserId);
                setIsJoined(true);
            } else {
                toast.error("Người dùng không online hoặc chưa sẵn sàng.");
            }
        }
    };

    const handleEndCall = () => {
        leaveCall();
    };

    useEffect(() => {
        if (isJoined && callAccepted && !callEnded) {
            if (myVideoFull.current && stream) myVideoFull.current.srcObject = stream;
            if (userVideoFull.current && remoteStream) userVideoFull.current.srcObject = remoteStream;
        }
    }, [isJoined, callAccepted, callEnded, stream, remoteStream]);

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((currentStream) => {
                setLocalStream(currentStream);
                if (myVideo.current) myVideo.current.srcObject = currentStream;
            })
            .catch(err => {
                console.error("Lỗi Camera:", err);
                toast.error("Không thể truy cập Camera/Mic.");
            });

        if (isIncoming) {
            const callerId = localStorage.getItem('tempCallerId');
            const signal = localStorage.getItem('tempCallSignal');
            if (callerId && signal) {
                setCall({
                    isReceivingCall: true,
                    from: callerId,
                    name: urlName,
                    signal: JSON.parse(signal)
                });
            }
        }

        if (socket && currentUser) {
            socket.emit("addNewUser", currentUser._id);
        }

        return () => {
            setLocalStream(prev => {
                if (prev) prev.getTracks().forEach(track => track.stop());
                return null;
            });
        };
    }, [socket, currentUser]);

    //  Cuộc gọi kết thúc
    if (callEnded) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1c1c1c] text-white">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <FaPhoneSlash className="text-red-500 text-4xl" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Cuộc gọi đã kết thúc</h1>
                <button
                    onClick={() => window.close()}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-semibold transition"
                >
                    Đóng tab này
                </button>
            </div>
        );
    }

    // Đang trong cuộc gọi
    if (isJoined && callAccepted && !callEnded) {
        return (
            <div className="relative w-screen h-screen bg-black group overflow-hidden">
                {/* Màn hình đối phương */}
                <div className="w-full h-full relative">
                    <video
                        ref={userVideoFull}
                        autoPlay playsInline
                        className={`w-full h-full object-cover ${!partnerMediaStatus.cam ? 'hidden' : ''}`}
                    />
                    {!partnerMediaStatus.cam && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                            <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                                <FaVideoSlash className="text-gray-500 text-4xl" />
                            </div>
                            <p className="text-gray-400">{urlName} đã tắt camera</p>
                        </div>
                    )}
                    {!partnerMediaStatus.mic && (
                        <div className="absolute top-20 left-6 bg-red-600/90 px-3 py-1.5 rounded-lg flex items-center gap-2 z-30">
                            <FaMicrophoneSlash className="text-white text-sm" />
                            <span className="text-white text-xs font-medium">{urlName} đã tắt mic</span>
                        </div>
                    )}
                </div>

                {/* Màn hình của mình */}
                <div className="absolute top-6 right-6 w-48 md:w-64 aspect-video bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-700 shadow-2xl z-40">
                    <video
                        ref={myVideoFull}
                        autoPlay playsInline muted
                        className={`w-full h-full object-cover transform scale-x-[-1] ${!camOn ? 'hidden' : ''}`}
                    />
                    {!camOn && (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                            <FaVideoSlash className="text-gray-400 mb-1" />
                            <span className="text-[10px] text-gray-500">Bạn đang tắt cam</span>
                        </div>
                    )}
                    {!micOn && (
                        <div className="absolute bottom-2 right-2 bg-red-500 p-1.5 rounded-full shadow-lg">
                            <FaMicrophoneSlash className="text-white text-[12px]" />
                        </div>
                    )}
                </div>

                {/* Thanh điều khiển */}
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-900/80 px-8 py-4 rounded-full backdrop-blur-md border border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={toggleCam} className={`p-4 rounded-full transition ${camOn ? 'bg-gray-500 hover:bg-gray-200' : 'bg-red-500 animate-pulse'}`}>
                        {camOn ? <FaVideo /> : <FaVideoSlash />}
                    </button>
                    <button onClick={toggleMic} className={`p-4 rounded-full transition ${micOn ? 'bg-gray-500 hover:bg-gray-200' : 'bg-red-500'}`}>
                        {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    </button>
                    <button onClick={handleEndCall} className="p-4 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-xl transform hover:scale-110 transition">
                        <FaPhoneSlash size={28} />
                    </button>
                </div>
            </div>
        );
    }

    // Màn hình chuẩn bị
    return (
        <div className="flex h-screen w-screen bg-[#1c1c1c] text-white">
            <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-gray-700">
                <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden">
                    <video playsInline muted ref={myVideo} autoPlay className={`w-full h-full object-cover transform scale-x-[-1] ${!camOn && 'hidden'}`} />
                    {!camOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 flex-col">
                            <FaVideoSlash size={25} className="text-gray-500 mb-3" />
                            <span className="text-gray-400 text-sm font-medium">Máy ảnh đang tắt</span>
                        </div>
                    )}
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4 bg-gray-900/60 px-4 py-2 rounded-full">
                        <button
                            onClick={() => { if (stream) { stream.getVideoTracks()[0].enabled = !camOn; setCamOn(!camOn); } }}
                            className={`p-3 rounded-full ${camOn ? 'bg-gray-700' : 'bg-red-500'}`}
                        >
                            {camOn ? <FaVideo /> : <FaVideoSlash />}
                        </button>
                        <button
                            onClick={() => { if (stream) { stream.getAudioTracks()[0].enabled = !micOn; setMicOn(!micOn); } }}
                            className={`p-3 rounded-full ${micOn ? 'bg-gray-700' : 'bg-red-500'}`}
                        >
                            {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-[400px] flex flex-col items-center justify-center bg-[#1c1c1c] p-8">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700 shadow-xl mb-6">
                    <img src={partnerAvatar} alt={urlName} className="w-full h-full object-cover"
                        onError={(e) => e.target.src = "https://via.placeholder.com/150"} />
                </div>
                <h2 className="text-2xl font-bold mb-2">{urlName}</h2>
                <p className="text-gray-400 mb-8">{isIncoming ? "Sẵn sàng tham gia?" : "Sẵn sàng gọi?"}</p>

                {!isIncoming && isJoined && !callAccepted ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <span className="text-blue-400 font-semibold">Đang đợi đối phương chấp nhận...</span>
                    </div>
                ) : (
                    <button
                        onClick={handleJoinCall}
                        disabled={!stream}
                        className={`px-10 py-4 font-bold rounded-full text-lg shadow-lg w-full max-w-[250px] transition ${!stream ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-500 text-white transform active:scale-95'}`}
                    >
                        {!stream ? "Đang bật Camera..." : (isIncoming ? "Tham gia ngay" : "Bắt đầu cuộc gọi")}
                    </button>
                )}
            </div>
        </div>
    );
};

export default VideoCallPage;