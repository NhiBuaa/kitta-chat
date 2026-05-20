import React, { useContext, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import {
    FaMicrophone,
    FaMicrophoneSlash,
    FaPhoneSlash,
    FaVideo,
    FaVideoSlash,
    FaPhoneAlt
} from "react-icons/fa";
import { toast } from "react-toastify";
import { useSocket } from "@/services/socket/SocketContext.js";
import { CallContext } from "@/features/calls/context/CallContext.jsx";
import { useCallTimer } from "@/features/calls/hooks/useCallTimer.js";
import { formatDuration } from "@/utils/formatTime.js";
import {
    canStartOutgoingCall,
    getPreAnswerCancelReason,
} from "@/features/calls/pages/callPageState.js";
import {
    setAudioEnabled,
    setVideoEnabled,
} from "@/features/calls/context/callMediaState.js";

const VideoCallPage = () => {
    const { partnerId } = useParams();
    const [searchParams] = useSearchParams();

    const isIncoming = searchParams.get("incoming") === "true";
    const urlName = searchParams.get("name") || "Nguoi dung";
    const urlAvatar = searchParams.get("avatar");
    const urlType = searchParams.get("type");
    const urlCallId = searchParams.get("callId"); // callId từ CallNotification URL param
    const storedType = localStorage.getItem("tempCallType");
    const callType = urlType || storedType || "video";
    const isVideoCall = callType === "video";
    const partnerAvatar = urlAvatar && urlAvatar !== "undefined" && urlAvatar !== "null"
            ? urlAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(urlName)}&background=random`;

    const { socket } = useSocket();
    const {
        callUser,
        answerCall,
        rejectCall,
        leaveCall,
        callAccepted,
        callEnded,
        myVideo,
        setCall,
        remoteStream,
        partnerMediaStatus,
    } = useContext(CallContext);

    const myVideoFull = useRef();
    const userVideoFull = useRef();

    const [stream, setLocalStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(isVideoCall);
    const [isJoined, setIsJoined] = useState(false);
    const [mediaError, setMediaError] = useState(false);
    const callDuration = useCallTimer(isJoined, callAccepted, callEnded);

    const notifyMediaChange = (newCam, newMic) => {
        const targetId =
            localStorage.getItem("activePartnerUserId") ||
            localStorage.getItem("tempCallerUserId");

        if (socket && targetId) {
            socket.emit("toggleMedia", { to: targetId, cam: newCam, mic: newMic });
        }
    };

    const toggleMic = () => {
        if (!stream) return;
        const newStatus = !micOn;
        setAudioEnabled(stream, newStatus);
        setMicOn(newStatus);
        notifyMediaChange(camOn, newStatus);
    };

    const toggleCam = () => {
        if (!stream || !isVideoCall) return;
        const newStatus = !camOn;
        setVideoEnabled(stream, newStatus);
        setCamOn(newStatus);
        notifyMediaChange(newStatus, micOn);
    };

    const handleJoinCall = () => {
        if (!socket || (!stream && !mediaError)) {
            toast.warn("Vui lòng đợi kết nối");
            return;
        }

        if (isIncoming) {
            const success = answerCall(stream, camOn, micOn);
            if (success) setIsJoined(true);
            return;
        }

        if (!canStartOutgoingCall({ socket, partnerId, stream, mediaError })) {
            toast.error("Chưa đủ điều kiện bắt đầu cuộc gọi.");
            return;
        }

        callUser(partnerId, stream, camOn, micOn, callType);
        setIsJoined(true);
    };

    const handleEndCall = () => {
        if (!isJoined && getPreAnswerCancelReason({ isIncoming }) === "rejected") {
            rejectCall();
            return;
        }

        leaveCall('CallPage:handleEndCall');
    };

    useEffect(() => {
        if (!isJoined || !callAccepted || callEnded) return;

        if (myVideoFull.current && stream) {
            myVideoFull.current.srcObject = stream;
            myVideoFull.current.play().catch(() => { });
        }

        if (userVideoFull.current && remoteStream) {
            userVideoFull.current.srcObject = remoteStream;
            userVideoFull.current.play().catch(() => { });
        }
    }, [isJoined, callAccepted, callEnded, stream, remoteStream, partnerMediaStatus.cam]);

    useEffect(() => {
        const initMedia = async () => {
            try {
                const currentStream = await navigator.mediaDevices.getUserMedia(
                    isVideoCall
                        ? { video: true, audio: true }
                        : { video: false, audio: true }
                );

                const hasVideoTrack = currentStream.getVideoTracks().length > 0;
                setLocalStream(currentStream);

                setMediaError(false);
                setCamOn(isVideoCall);
                setMicOn(true);
                if (myVideo.current) myVideo.current.srcObject = currentStream;

                // Chỉ gắn video track event khi thực sự có video track
                if (hasVideoTrack && isVideoCall) {
                    const videoTrack = currentStream.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrack.onended = () => {
                            toast.error("Camera bị ngắt kết nối đột ngột!");
                            setCamOn(false);
                            notifyMediaChange(false, micOn);
                        };
                    }
                }

            } catch (err) {
                console.error("Lỗi Camera/Mic ban đầu:", err.name);

                if (err.name === 'NotAllowedError') {
                    toast.error("Bạn đã từ chối quyền truy cập. Chỉ có thể xem/nghe.");
                    setMediaError(true);
                    setCamOn(false);
                    setMicOn(false);
                }
                // NẾU CAMERA HƯ HOẶC BỊ ỨNG DỤNG KHÁC CHIẾM DỤNG
                else if (err.name === 'NotFoundError') {
                    toast.error("Không tìm thấy Camera/Microphone. Vui lòng kiểm tra lại jack cắm.");
                }
                else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    toast.warn("Camera đang bị ứng dụng khác sử dụng hoặc bị lỗi phần cứng. Đang chuyển sang chế độ Audio...");
                }
                else if (err.name === 'OverconstrainedError') {
                    toast.error("Thiết bị không đáp ứng được yêu cầu chất lượng video.");
                } else {
                    toast.error("Lỗi thiết bị không xác định. Tham gia với tư cách khán giả.");
                    setMediaError(true);
                    setCamOn(false);
                    setMicOn(false);
                }

                if (['NotFoundError', 'NotReadableError', 'TrackStartError'].includes(err.name)) {
                    try {
                        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        setLocalStream(audioOnlyStream);

                        // Thử xin lại quyền nhưng CHỈ LẤY MIC
                        setCamOn(false);
                        setMicOn(true);
                        setMediaError(false);

                        toast.success("Đã kết nối được Microphone!");
                    } catch (audioErr) {
                        console.error("Lỗi Fallback Mic:", audioErr.name);
                        toast.error("Không thể kết nối cả Camera lẫn Mic. Tham gia với tư cách khán giả.");
                        setMediaError(true);
                        setCamOn(false);
                        setMicOn(false);
                    }
                }
            }
        }

        initMedia();

        if (isIncoming) {
            const callerId = localStorage.getItem("tempCallerId");
            const signal = localStorage.getItem("tempCallSignal");
            if (callerId && signal) {
                setCall({
                    isReceivingCall: true,
                    from: callerId,
                    name: urlName,
                    signal: JSON.parse(signal),
                    callType: callType
                });
                // Ưu tiên callId từ URL param (CallNotification), fallback vào localStorage
                const callIdToStore = urlCallId || localStorage.getItem("tempCallId");
                if (callIdToStore) {
                    localStorage.setItem("tempCallId", callIdToStore);
                }
            }
        }

        return () => {
            setLocalStream((prev) => {
                if (prev) {
                    prev.getTracks().forEach((track) => track.stop());
                }
                return null;
            });
        };
    }, [isIncoming, myVideo, setCall, urlName]);

    // Trang khi thực hiện kết thúc cuộc gọi
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

    // Trang trong cuộc gọi
    if (isJoined && callAccepted && !callEnded) {
        return (
            <div className="relative w-screen h-screen bg-[#111] group overflow-hidden">
                <div className="w-full h-full relative flex flex-col items-center justify-center">
                    {/* KHU VỰC ĐỐI PHƯƠNG */}
                    {isVideoCall ? (
                        <>
                            <video
                                ref={userVideoFull}
                                autoPlay
                                playsInline
                                className={`w-full h-full object-cover ${!partnerMediaStatus.cam ? "hidden" : ""}`}
                            />
                            {!partnerMediaStatus.cam && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
                                    <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                                        <FaVideoSlash className="text-gray-500 text-4xl" />
                                    </div>
                                    <p className="text-gray-400">{urlName} đang tắt cam</p>
                                </div>
                            )}
                        </>
                    ) : (
                        // GIAO DIỆN GỌI AUDIO
                        <div className="flex flex-col items-center justify-center">
                            <img
                                src={partnerAvatar}
                                alt={urlName}
                                className="w-40 h-40 rounded-full object-cover shadow-[0_0_50px_rgba(59,130,246,0.3)] animate-pulse"
                            />
                            <h2 className="text-3xl text-white font-semibold mt-6">{urlName}</h2>
                            <p className="text-gray-400 mt-2">{formatDuration(callDuration)}</p>
                            {!partnerMediaStatus.mic && (
                                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-sm font-medium text-white shadow-lg">
                                    <FaMicrophoneSlash className="text-xs" />
                                    <span>{urlName} đang tắt mic</span>
                                </div>
                            )}
                            {/* Thẻ video ẩn đi chỉ để phát tiếng */}
                            <video ref={userVideoFull} autoPlay playsInline className="hidden" />
                        </div>
                    )}

                    {!partnerMediaStatus.mic && isVideoCall && (
                        <div className="absolute top-20 left-6 bg-red-600/90 px-3 py-1.5 rounded-lg flex items-center gap-2 z-30">
                            <FaMicrophoneSlash className="text-white text-sm" />
                            <span className="text-white text-xs font-medium">{urlName} đang tắt mic</span>
                        </div>
                    )}
                </div>

                {/* KHU VỰC CỦA MÌNH NHỎ */}
                {isVideoCall && (
                    <div className="absolute top-6 right-6 w-48 md:w-64 aspect-video bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-700 shadow-2xl z-40">
                        <video
                            ref={myVideoFull}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transform scale-x-[-1] ${!camOn ? "hidden" : ""}`}
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
                )}

                {/* THANH ĐIỀU KHIỂN */}
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-900/80 px-8 py-4 rounded-full backdrop-blur-md border border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Ẩn nút Cam nếu là gọi thoại */}
                    {isVideoCall && (
                        <button
                            onClick={toggleCam}
                            className={`p-4 rounded-full transition transform hover:scale-110 ${camOn ? "bg-gray-500 hover:bg-gray-200" : "bg-red-500 animate-pulse"}`}
                        >
                            {camOn ? <FaVideo /> : <FaVideoSlash />}
                        </button>
                    )}
                    <button
                        onClick={toggleMic}
                        className={`p-4 rounded-full transition transform hover:scale-110 ${micOn ? "bg-gray-500 hover:bg-gray-200" : "bg-red-500"}`}
                    >
                        {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    </button>
                    <button
                        onClick={handleEndCall}
                        className="p-4 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-xl transform hover:scale-110 transition"
                    >
                        <FaPhoneSlash size={28} />
                    </button>
                </div>
            </div>
        );
    }

    // Trang chuẩn bị trước cuộc gọi
    return (
        <div className="flex h-screen w-screen bg-[#1c1c1c] text-white">
            <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-gray-700">
                {isVideoCall ? (
                    <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
                        <video
                            playsInline
                            muted
                            ref={myVideo}
                            autoPlay
                            className={`w-full h-full object-cover transform scale-x-[-1] ${!camOn ? "hidden" : ""}`}
                        />
                        {!camOn && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 flex-col">
                                <FaVideoSlash size={25} className="text-gray-500 mb-3" />
                                <span className="text-gray-400 text-sm font-medium">Máy ảnh đang tắt</span>
                            </div>
                        )}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4 bg-gray-900/60 px-4 py-2 rounded-full backdrop-blur-sm">
                            <button
                                onClick={() => {
                                    if (!stream) return;
                                    const newStatus = !camOn;
                                    setVideoEnabled(stream, newStatus);
                                    setCamOn(newStatus);
                                }}
                                className={`p-3 rounded-full transition ${camOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600"}`}
                            >
                                {camOn ? <FaVideo /> : <FaVideoSlash />}
                            </button>
                            <button
                                onClick={() => {
                                    if (!stream) return;
                                    const newStatus = !micOn;
                                    setAudioEnabled(stream, newStatus);
                                    setMicOn(newStatus);
                                }}
                                className={`p-3 rounded-full transition ${micOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600"}`}
                            >
                                {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                            </button>
                        </div>
                    </div>
                ) : (
                    // GIAO DIỆN CHUẨN BỊ GỌI THOẠI
                    <div className="flex flex-col items-center">
                        <div className="w-32 h-32 bg-gray-800 rounded-full flex items-center justify-center shadow-lg border-2 border-gray-700 mb-8">
                            <FaPhoneAlt className="text-4xl text-blue-500" />
                        </div>
                        <h2 className="text-xl text-gray-300">Chuẩn bị cuộc gọi thoại</h2>
                        <div className="mt-8">
                            <button
                                onClick={() => {
                                    if (!stream) return;
                                    const newStatus = !micOn;
                                    setAudioEnabled(stream, newStatus);
                                    setMicOn(newStatus);
                                }}
                                className={`px-6 py-3 rounded-full flex items-center gap-2 font-medium transition ${micOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"}`}
                            >
                                {micOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                                {micOn ? "Microphone đang bật" : "Microphone đang tắt"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="w-[400px] flex flex-col items-center justify-center bg-[#1c1c1c] p-8">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700 shadow-xl mb-6">
                    <img
                        src={partnerAvatar}
                        alt={urlName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.target.src = "https://via.placeholder.com/150";
                        }}
                    />
                </div>
                <h2 className="text-2xl font-bold mb-2">{urlName}</h2>
                <p className="text-gray-400 mb-8">{isIncoming ? `Sẵn sàng tham gia cuộc gọi ${isVideoCall ? 'video' : 'thoại'}?` : `Bắt đầu gọi ${isVideoCall ? 'video' : 'thoại'}?`}</p>

                {!isIncoming && isJoined && !callAccepted ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <span className="text-blue-400 font-semibold">Đang đợi đối phương chấp nhận</span>
                    </div>
                ) : (
                    <button
                        onClick={handleJoinCall}
                        className={`px-10 py-4 font-bold rounded-full text-lg shadow-lg transition ${(!stream && !mediaError) ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-500 text-white transform active:scale-95'}`}
                    >
                        {(!stream && !mediaError) ? "Đang kết nối..." : (isIncoming ? "Tham gia" : "Bắt đầu cuộc gọi")}
                    </button>
                )}
                <button
                    onClick={handleEndCall}
                    className="mt-5 px-8 py-3 font-semibold rounded-full text-red-500 bg-red-500/10 hover:bg-red-500/20 transition"
                >
                    Hủy cuộc gọi
                </button>
            </div>

            <ToastContainer position="top-center" autoClose={3000} />
        </div>
    );
};

export default VideoCallPage;
