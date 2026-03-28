import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { CallContext } from '../context/CallContext';
import { FaPhone, FaVideo } from "react-icons/fa";

const CallNotification = () => {
    const { call, setCall, rejectCall } = useContext(CallContext);
    const location = useLocation();
    const isVideoCall = call.callType === "video";

    if (!call.isReceivingCall || location.pathname.includes('/video-call')) return null;

    const handleAnswer = (type = "video") => {
        if (call.signal && call.from) {
            localStorage.setItem('tempCallSignal', JSON.stringify(call.signal));
            localStorage.setItem('tempCallerId', call.from);
        }

        const avatar = call.avatar || "";
        const url = `/call/${call.from}?incoming=true&name=${encodeURIComponent(call.name)}&avatar=${encodeURIComponent(avatar)}&type=${type}`;

        window.open(url, "CallWindow", "width=1200,height=800,noopener,noreferrer");

        setCall((prev) => ({ ...prev, isReceivingCall: false }));
    };

    return (
        <div className="fixed bottom-4 right-4 z-[9999] font-sans">
            <div className="bg-white p-4 rounded-xl shadow-2xl border border-blue-100 animate-bounce w-72">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white bg-green-500`}>
                        {!isVideoCall ? (
                            <FaVideo className="text-xl animate-pulse" />
                        ) : (
                            <FaPhone className="text-xl animate-pulse" />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">{call.name || "Người lạ"}</h3>
                        <p className={`text-xs font-medium text-green-500`}>
                            {isVideoCall ? 'đang gọi thoại...' : 'đang gọi video...'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleAnswer} className="flex-1 bg-green-500 text-white py-2 rounded-lg font-bold">Trả lời</button>
                    <button onClick={() => { rejectCall(); setCall(prev => ({ ...prev, isReceivingCall: false })); }} className="flex-1 bg-red-100 text-red-600 py-2 rounded-lg font-bold">Từ chối</button>
                </div>
            </div>
        </div>
    );
};

export default CallNotification;