import React, { useContext, useEffect, useRef, useState } from 'react';
import { CallContext } from '../context/CallContext.jsx';

// IMPORT ICONS
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhoneSlash, FaPhone, FaTimes } from "react-icons/fa";
import { MdCallEnd, MdCall } from "react-icons/md";

const VideoCallWidget = () => {
    const {
        callAccepted,
        callEnded,
        stream,
        remoteStream,
        call,
        answerCall,
        leaveCall,
        rejectCall
    } = useContext(CallContext);

    // REF
    const myVideo = useRef();
    const userVideo = useRef();

    // STATE
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCamOn, setIsCamOn] = useState(true);

    // Gắn stream của MÌNH vào thẻ video
    useEffect(() => {
        if (stream && myVideo.current) {
            myVideo.current.srcObject = stream;
        }
    }, [stream]);

    // Gắn stream của ĐỐI PHƯƠNG vào thẻ video
    useEffect(() => {
        if (remoteStream && userVideo.current) {
            userVideo.current.srcObject = remoteStream;
        }
    }, [remoteStream, callAccepted]);

    // Logic bật tắt Mic/Cam
    const toggleMic = () => {
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMicOn(audioTrack.enabled);
            }
        }
    };

    const toggleCam = () => {
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCamOn(videoTrack.enabled);
            }
        }
    };

    // Nếu không có stream và không có cuộc gọi đến thì ẩn
    if (!stream && !call.isReceivingCall) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end space-y-4 font-sans">

            {/* KHUNG VIDEO */}
            <div className={`transition-all duration-300 relative ${callAccepted && !callEnded ? 'w-80 h-60' : 'w-48 h-36'}`}>

                {/* Video người khác (Lớp nền - Lớn) */}
                {callAccepted && !callEnded && (
                    <div className="w-full h-full bg-black rounded-lg overflow-hidden shadow-xl border border-gray-700 relative">
                        <video
                            playsInline
                            ref={userVideo}
                            autoPlay
                            className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-1 rounded-full">
                            {call.name || "Người lạ"}
                        </span>
                    </div>
                )}

                {/* Video của mình (PIP - Nhỏ - Nằm đè lên trên) */}
                {stream && (
                    <div className={`absolute z-10 bg-black rounded-lg overflow-hidden shadow-lg border border-white transition-all duration-300 
                        ${callAccepted && !callEnded
                            ? 'w-24 h-16 bottom-2 right-2' // Khi đang gọi thì thu nhỏ xuống góc
                            : 'w-full h-full inset-0'      // Khi chưa gọi thì phóng to
                        }`}>
                        <video
                            playsInline
                            muted
                            ref={myVideo}
                            autoPlay
                            className="w-full h-full object-cover transform scale-x-[-1]"
                        />
                        {/* Chỉ hiện chữ "Bạn" khi video phóng to */}
                        {(!callAccepted || callEnded) && (
                            <span className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded-full">Bạn</span>
                        )}
                    </div>
                )}
            </div>

            {/* POPUP CUỘC GỌI ĐẾN */}
            {call.isReceivingCall && !callAccepted && (
                <div className="bg-white p-4 rounded-xl shadow-2xl border border-blue-100 animate-bounce w-72">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            {/* Icon Rung Chuông */}
                            <MdCall className="text-2xl animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">{call.name || "Người lạ"}</h3>
                            <p className="text-xs text-blue-500 font-medium">đang gọi video...</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={answerCall}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-bold shadow-md transition transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <FaPhone /> Nghe
                        </button>
                        <button
                            onClick={rejectCall}
                            className="flex-1 bg-red-100 hover:bg-red-200 text-red-600 py-2 rounded-lg font-bold transition transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <FaTimes /> Từ chối
                        </button>
                    </div>
                </div>
            )}

            {/* THANH ĐIỀU KHIỂN */}
            {stream && (
                <div className="bg-gray-900/90 p-3 rounded-full flex gap-4 backdrop-blur-md shadow-2xl border border-gray-700">
                    {/* Nút Mic */}
                    <button
                        onClick={toggleMic}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition text-lg ${isMicOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white'}`}
                        title={isMicOn ? "Tắt Mic" : "Bật Mic"}
                    >
                        {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    </button>

                    {/* Nút Camera */}
                    <button
                        onClick={toggleCam}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition text-lg ${isCamOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white'}`}
                        title={isCamOn ? "Tắt Cam" : "Bật Cam"}
                    >
                        {isCamOn ? <FaVideo /> : <FaVideoSlash />}
                    </button>

                    <button
                        onClick={leaveCall}
                        className="bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-110 text-xl"
                        title="Kết thúc"
                    >
                        <MdCallEnd />
                    </button>
                </div>
            )}
        </div>
    );
};

export default VideoCallWidget;