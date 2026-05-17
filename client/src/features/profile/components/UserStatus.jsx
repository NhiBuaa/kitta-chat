import React, { useEffect, useState } from "react";
import { formatTimeAgo } from "@/utils/formatTime.js";

const UserStatus = ({ user, isOnline }) => {
    const [ticker, setTicker] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setTicker((tick) => tick + 1);
        }, 30000);

        return () => clearInterval(interval);
    }, [user?.activityStatus?.lastSeen]);

    const isActive =
        isOnline !== undefined
            ? isOnline
            : user.activityStatus?.state === "online" || user.activityStatus?.state === "active";

    const lastSeen = user.activityStatus?.lastSeen;
    const timeAgo = lastSeen && ticker !== undefined ? formatTimeAgo(lastSeen) : null;

    if (isActive) {
        return (
            <span className="text-green-600 font-medium text-xs flex items-center">
                Đang hoạt động
            </span>
        );
    }

    if (!lastSeen) {
        return <span className="text-gray-400 text-xs">Truy cập gần đây</span>;
    }

    if (!timeAgo) {
        return <span className="text-gray-400 text-xs">Hoạt động vài giây trước</span>;
    }

    return <span className="text-gray-400 text-xs">Hoạt động {timeAgo}</span>;
};

export default UserStatus;
