import React from 'react';

const MessageSeenBy = ({ seenByList, currentUser, getAvatarUrl }) => {
    //  Nếu chưa ai xem thì không render gì cả
    if (!seenByList || seenByList.length === 0) return null;

    // Không hiển thị chính mình
    const otherViewers = seenByList.filter(
        (user) => user._id.toString() !== currentUser._id.toString()
    );

    if (otherViewers.length === 0) return null;

    // CẤU HÌNH HIỂN THỊ
    const MAX_AVATARS = 5;
    const displayViewers = otherViewers.slice(0, MAX_AVATARS);
    const remainingCount = otherViewers.length - MAX_AVATARS;

    return (
        <div className="flex items-center justify-end mt-1 -space-x-1.5">
            {displayViewers.map((user, index) => (
                <img
                    key={user._id}
                    src={getAvatarUrl(user.avatar)}
                    alt={user.displayName}
                    title={user.displayName}
                    className={`w-4 h-4 rounded-full border border-white object-cover relative`}
                    style={{ zIndex: displayViewers.length - index }}
                />
            ))}

            {/* Trên 5 người thì hiện + */}
            {remainingCount > 0 && (
                <div
                    className="w-4 h-4 rounded-full bg-gray-200 border border-white flex items-center justify-center relative z-0"
                    title={`Và ${remainingCount} người khác`}
                >
                    <span className="text-[8px] font-medium text-gray-600">
                        +{remainingCount}
                    </span>
                </div>
            )}
        </div>
    );
};

export default MessageSeenBy;