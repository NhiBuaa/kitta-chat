import React from 'react';
import { formatTimeAgo } from '../utils/formatTime';

const UserStatus = ({ user, isOnline }) => {
    const isActive = isOnline !== undefined
        ? isOnline
        : user.activityStatus?.state === 'active';

    const lastSeen = user.activityStatus?.lastSeen;

    if (isActive) {
        return <span className="text-green-600 font-medium text-xs">Đang hoạt động</span>;
    } else {
        return (
            <span className="text-gray-400 text-xs">
                {lastSeen
                    ? `Offline ${formatTimeAgo(lastSeen)}`
                    : (user.status || "Offline")
                }
            </span>
        );
    }
};

export default UserStatus;