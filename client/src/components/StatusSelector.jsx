import React, { useState } from 'react';
import moment from 'moment';

const StatusControl = ({ currentStatus, lastSeen, onUpdateStatus }) => {
    const [status, setStatus] = useState(currentStatus || 'active');

    // Hàm tính toán thời gian offline
    const getOfflineTime = (dateString) => {
        if (!dateString) return '';
        return moment(dateString).fromNow(); // Cần config moment tiếng Việt nếu muốn
    };

    const handleStatusChange = (newStatus) => {
        setStatus(newStatus);
        // Gọi hàm callback để báo lên component cha (nơi gọi API)
        onUpdateStatus(newStatus);
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
                Trạng thái hoạt động
            </label>

            <div className="flex flex-col space-y-3">
                {/* Option 1: Active */}
                <button
                    onClick={() => handleStatusChange('active')}
                    className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${status === 'active'
                            ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                            : 'border-gray-200 hover:border-green-300'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className="flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                            </span>
                        </div>
                        <div className="text-left">
                            <span className={`block font-semibold ${status === 'active' ? 'text-green-700' : 'text-gray-700'}`}>
                                Đang hoạt động (Active)
                            </span>
                            <span className="text-xs text-gray-500">Hiển thị với mọi người</span>
                        </div>
                    </div>
                    {status === 'active' && (
                        <span className="text-green-600">✔</span>
                    )}
                </button>

                {/* Option 2: Offline */}
                <button
                    onClick={() => handleStatusChange('offline')}
                    className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${status === 'offline'
                            ? 'border-gray-500 bg-gray-100 ring-1 ring-gray-500' // Offline Selected style
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        {/* Chấm màu xám */}
                        <div className="h-3 w-3 rounded-full bg-gray-400 border border-gray-200"></div>

                        <div className="text-left">
                            <span className={`block font-semibold ${status === 'offline' ? 'text-gray-800' : 'text-gray-700'}`}>
                                Ẩn (Offline)
                            </span>
                            <span className="text-xs text-gray-500">
                                {status === 'offline'
                                    ? `Bắt đầu từ: ${getOfflineTime(lastSeen || new Date())}`
                                    : 'Bạn sẽ hiển thị là offline'}
                            </span>
                        </div>
                    </div>
                    {status === 'offline' && (
                        <span className="text-gray-600">✔</span>
                    )}
                </button>
            </div>
        </div>
    );
};

export default StatusControl;