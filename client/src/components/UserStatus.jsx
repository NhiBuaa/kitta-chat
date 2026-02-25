import React, { useState, useEffect } from 'react';
import { formatTimeAgo } from '../utils/formatTime';

const UserStatus = ({ user, isOnline }) => {
    const [ticker, setTicker] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setTicker((tick) => tick + 1);
        }, 30000);

        // Dọn dẹp bộ đếm khi component bị hủy
        return () => clearInterval(interval);
    }, [user?.activityStatus?.lastSeen]);

    // LOGIC KIỂM TRA ONLINE
    const isActive = isOnline !== undefined
        ? isOnline
        : (user.activityStatus?.state === 'active');

    const lastSeen = user.activityStatus?.lastSeen;

    const timeAgo = lastSeen && ticker !== undefined ? formatTimeAgo(lastSeen) : null;

    // --- ĐANG ONLINE ---
    if (isActive) {
        return (
            <span className="text-green-600 font-medium text-xs flex items-center">
                Đang hoạt động
            </span>
        );
    }

    // --- OFFLINE ---
    else {
        if (!lastSeen) {
            return <span className="text-gray-400 text-xs">Truy cập gần đây</span>;
        }

        // Nếu mới offline dưới 1 phút hiển thị vừa mới truy cập
        if (!timeAgo) {
            return (
                <span className="text-green-600 font-medium text-xs">
                    Đang hoạt động
                </span>
            );
        }

        // Offline lâu hơn 1 phút thì hiển thị truy cập bao lâu trước đó
        return (
            <span className="text-gray-400 text-xs">
                Hoạt động {timeAgo}
            </span>
        );
    }
};

export default UserStatus;