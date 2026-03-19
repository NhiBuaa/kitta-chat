import React from 'react';
import { PreviewMedia } from './PreviewMedia';

// Format dung lượng file
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const UploadItem = ({ item }) => {
    const { file, progress, status, url } = item;

    const getProgressColor = () => {
        switch (status) {
            case 'completed': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            default: return 'bg-blue-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'waiting': return 'Đang chờ...';
            case 'uploading': return `Đang tải lên... ${progress}%`;
            case 'completed': return 'Hoàn tất';
            case 'error': return 'Lỗi tải lên';
            default: return '';
        }
    };

    return (
        <div className="flex items-center p-3 mb-3 bg-white border border-gray-200 rounded-lg shadow-sm transition-all hover:shadow-md">

            {/* Preview*/}
            <div className="flex-shrink-0 mr-4">
                <PreviewMedia file={file} />
            </div>

            {/* Phần thông tin & tiến trình */}
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                    {/* Tên file & Kích thước */}
                    <div className="truncate pr-4">
                        <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                            {formatBytes(file.size)}
                        </p>
                    </div>

                    {/* Trạng thái */}
                    <span className={`text-xs font-semibold ${status === 'completed' ? 'text-green-600' :
                        status === 'error' ? 'text-red-600' :
                            'text-blue-600'
                        }`}>
                        {getStatusText()}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div
                        className={`h-1.5 rounded-full transition-all duration-300 ease-out ${getProgressColor()}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* URL trả về */}
                {status === 'completed' && url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs text-blue-500 hover:text-blue-700 hover:underline truncate w-full"
                    >
                        {url}
                    </a>
                )}
            </div>

        </div>
    );
};