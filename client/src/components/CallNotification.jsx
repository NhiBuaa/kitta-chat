import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom'; 
import { CallContext } from '../context/CallContext';
import { MdCall } from "react-icons/md";

const CallNotification = () => {
    const { call, setCall, rejectCall } = useContext(CallContext);
    const location = useLocation();

    if (!call.isReceivingCall || location.pathname.includes('/video-call')) {
        return null;
    }

    const handleAnswer = () => {
        if (call.signal && call.from) {
            localStorage.setItem('tempCallSignal', JSON.stringify(call.signal));
            localStorage.setItem('tempCallerId', call.from);
        }

        const avatar = call.avatar || "";
        const url = `/video-call/${call.from}?incoming=true&name=${encodeURIComponent(call.name)}&avatar=${encodeURIComponent(avatar)}`;

        window.open(url, '_blank', 'noopener,noreferrer');

        setCall((prev) => ({ ...prev, isReceivingCall: false }));
    };

    return (
        <div className="fixed bottom-4 right-4 z-[9999] font-sans">
            <div className="bg-white p-4 rounded-xl shadow-2xl border border-blue-100 animate-bounce w-72">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <MdCall className="text-2xl animate-pulse" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">{call.name || "Người lạ"}</h3>
                        <p className="text-xs text-blue-500 font-medium">đang gọi video...</p>
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