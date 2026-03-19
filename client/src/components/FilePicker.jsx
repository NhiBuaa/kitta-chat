import React, { useRef, useState } from "react";
import { FaFolderOpen } from "react-icons/fa"

export const FilePicker = ({
    onFilesSelected,
    accept,
    multiple = true,
    children,
    className = "",
    disableClick = false
}) => {
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    // Xử lý khi chọn file bằng nút click
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
        }
        e.target.value = "";
    };

    const handleClick = () => {
        if (!disableClick && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // CÁC HÀM XỬ LÝ KÉO THẢ DRAG & DROP
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
        }
    };

    return (
        <div
            onClick={handleClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`relative ${disableClick ? "" : "cursor-pointer"} ${className}`}
        >
            <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                accept={accept}
                multiple={multiple}
                onChange={handleFileChange}
            />

            {/* HIỆU ỨNG */}
            {isDragging && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-50/90 border-4 border-dashed border-blue-400 rounded-xl transition-all duration-200 backdrop-blur-sm m-2">
                    <div className="text-blue-600 font-bold text-xl flex flex-col items-center pointer-events-none">
                        <FaFolderOpen className="text-6xl mb-4 animate-bounce" />
                        Thả file vào đây để gửi ngay
                    </div>
                </div>
            )}

            {children}
        </div>
    );
};