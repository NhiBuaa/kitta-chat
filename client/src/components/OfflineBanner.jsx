import React, { useState, useEffect } from "react";
import { FiWifiOff } from "react-icons/fi";

/**
 * Banner nhỏ hiển thị ở top của chat area khi mất kết nối mạng.
 * Tự động ẩn khi online trở lại.
 */
const OfflineBanner = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);

        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2 text-amber-700 text-xs">
            <FiWifiOff />
            <span>Mất kết nối mạng. Tin nhắn đang chờ gửi...</span>
        </div>
    );
};

export default OfflineBanner;
