import React from 'react';
import { formatTimeAgo } from '../utils/formatTime';

const UserStatus = ({ user, isOnline }) => {
    const isActive = isOnline !== undefined
        ? isOnline
        : (user.activityStatus?.state === 'active');

    const lastSeen = user.activityStatus?.lastSeen;

    if (isActive) {
        return (
            <span className="text-green-600 font-medium text-xs flex items-center">
                Đang hoạt động
            </span>
        );
    }

    else {
        if (!lastSeen) {
            return <span className="text-gray-400 text-xs">Truy cập gần đây</span>;
        }

        const now = new Date();
        const lastSeenDate = new Date(lastSeen);
        const diffInSeconds = Math.floor((now - lastSeenDate) / 1000);

        if (diffInSeconds < 60) {
            return (
                <span className="text-green-600 font-medium text-xs">
                    Vừa mới truy cập
                </span>
            );
        }

        return (
            <span className="text-gray-400 text-xs">
                Truy cập {formatTimeAgo(lastSeen)}
            </span>
        );
    }
};

export default UserStatus;