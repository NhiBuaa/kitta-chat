import React from 'react';
import { useCallHistory } from '@/features/calls/context/CallHistoryContext.js';

const CallHistoryBadge = () => {
    const { missedCount } = useCallHistory();

    // Ép kiểu về số nguyên để đảm bảo an toàn 100%
    const count = Number(missedCount) || 0;

    // Nếu bằng 0 thì ẩn đi
    if (count === 0) return null;

    return (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
            {/* Hiệu ứng nhấp nháy */}
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>

            {/* Vòng tròn đỏ chứa số */}
            <span className="relative flex items-center justify-center rounded-full h-4 w-4 bg-red-600 text-white text-[9px] font-bold border border-white shadow-sm">
                {count > 9 ? "9+" : count}
            </span>
        </span>
    );
};

export default CallHistoryBadge;