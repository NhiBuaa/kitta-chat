import React, { useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { CallContext } from '../context/CallContext';
import { FaPhone, FaVideo } from "react-icons/fa";

const CallNotification = () => {
    const { call, setCall, rejectCall } = useContext(CallContext);
    const location = useLocation();
    const audioRef = useRef(null);

    const isVideoCall = call.callType === "video";

    // Xử lý chuông báo (Tự động tắt khi cúp máy)
    useEffect(() => {
        if (call.isReceivingCall && !location.pathname.includes('/call')) {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => { });
            }
        } else {
            if (audioRef.current) audioRef.current.pause();
        }
    }, [call.isReceivingCall, location.pathname]);

    if (!call.isReceivingCall || location.pathname.includes('/call')) return null;

    const handleAnswer = () => {
        if (audioRef.current) audioRef.current.pause(); // Tắt chuông ngay lập tức
        if (call.signal && call.from) {
            localStorage.setItem('tempCallSignal', JSON.stringify(call.signal));
            localStorage.setItem('tempCallerId', call.from);
        }

        const type = call.callType || "video";
        const avatar = call.avatar || "";
        const url = `/call/${call.from}?incoming=true&name=${encodeURIComponent(call.name)}&avatar=${encodeURIComponent(avatar)}&type=${type}`;

        localStorage.setItem("tempCallType", type);
        window.open(url, "CallWindow", "width=1200,height=800,noopener,noreferrer");

        setCall((prev) => ({ ...prev, isReceivingCall: false }));
    };

    const handleReject = () => {
        if (audioRef.current) audioRef.current.pause();
        rejectCall();
    };

    return (
        <>
            <audio 
                ref={audioRef}
                src="/audio/audio-call.mp3"
                loop
                preload="auto"
            />

            <div className="fixed bottom-4 right-4 z-[9999] font-sans">
                <div className="bg-white p-4 rounded-xl shadow-2xl border border-blue-100 animate-bounce w-72">
                    <div className="flex items-center gap-3 mb-4">
                        <img
                            src={call.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(call.name || "U")}&background=random`}
                            alt={call.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-green-500"
                        />
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">{call.name || "Người lạ"}</h3>
                            <div className="flex items-center gap-1.5">
                                {isVideoCall ? (
                                    <FaVideo className="text-green-500 text-xs animate-pulse" />
                                ) : (
                                    <FaPhone className="text-green-500 text-xs animate-pulse" />
                                )}
                                <p className={`text-xs font-medium text-green-500`}>
                                    {!isVideoCall ? 'đang gọi thoại...' : 'đang gọi video...'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleAnswer} className="flex-1 bg-green-500 text-white py-2 rounded-lg font-bold">Trả lời</button>
                        <button onClick={handleReject} className="flex-1 bg-red-100 text-red-600 py-2 rounded-lg font-bold">Từ chối</button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default CallNotification;