import { useState } from 'react';
import { uploadFileChunked, uploadFileSingle } from '@/hooks/useUpload.js';
import { toast } from 'react-toastify';
import imageCompression from 'browser-image-compression';

// BIẾN
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE = 30 * 1024 * 1024;

export const useUploader = () => {
    const [uploadQueue, setUploadQueue] = useState([]);

    const updateFileStatus = (id, updates) => {
        setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const startUpload = async (id, file, uploadType) => {
        updateFileStatus(id, { status: 'uploading' });
        try {
            let result;
            const onProgress = (percent) => {
                updateFileStatus(id, { progress: percent });
            };

            if (uploadType === 'image_nened') {
                result = await uploadFileSingle(file, onProgress);
            } else {
                result = await uploadFileChunked(file, onProgress);
            }

            updateFileStatus(id, {
                status: 'completed',
                url: result.cdnUrl || result.url || null,
                dbFileId: result._id,
                originalName: result.originalName || result.name || file.name,
                mimeType: result.mimeType || result.type || file.type,
                size: result.size || file.size
            });

            return result;
        } catch (error) {
            updateFileStatus(id, { status: 'error' });
            console.error("useUploader lỗi chi tiết: ", error.response?.data || error.message);
            throw error;
        }
    };

    // THÊM FILE VÀO QUÁ TRÌNH TẢI LÊN
    const addFiles = async (files) => {
        const validFiles = [];

        const compressionOptions = {
            maxSizeMB: 0.5,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: 'image/webp'
        };

        const filesArray = Array.from(files);

        for (const file of filesArray) {
            let uploadType = 'normal';
            let fileToUpload = file;
            const id = Math.random().toString(36).substr(2, 9);

            try {
                if (file.type.startsWith('image/')) {

                    const compressedFile = await imageCompression(file, compressionOptions);

                    const originalNameNoExt = file.name.split('.').slice(0, -1).join('.');
                    fileToUpload = new File([compressedFile], `${originalNameNoExt}.webp`, { type: 'image/webp' });

                    uploadType = 'image_nened';
                }
                else if (file.type.startsWith('video/')) {
                    if (file.size > MAX_VIDEO_SIZE) {
                        toast.error(`Video "${file.name}" vượt quá 50MB!`);
                        continue;
                    }
                }
                else {
                    if (file.size > MAX_FILE_SIZE) {
                        toast.error(`File "${file.name}" vượt quá 30MB!`);
                        continue;
                    }
                }

                validFiles.push({ id, file: fileToUpload, uploadType });

            } catch (err) {
                console.error("Lỗi xử lý file trước upload:", err);
                toast.error(`Lỗi xử lý file: ${file.name}`);
            }
        }

        // Nếu không có file nào đáp ứng được thì return luôn
        if (validFiles.length === 0) return;

        const newEntries = validFiles.map(entry => ({
            id: entry.id,
            file: entry.file,
            progress: 0,
            status: 'waiting', // waiting, uploading, completed, error
            url: null
        }));
        setUploadQueue(prev => [...prev, ...newEntries]);

        // Bắt đầu upload từng file
        newEntries.forEach(entry => startUpload(entry.id, entry.file, entry.uploadType));
    };

    const removeUploadItem = (id) => {
        setUploadQueue(prev => prev.filter(item => item.id !== id));
    };

    const clearUploads = () => setUploadQueue([]);
    return { uploadQueue, addFiles, clearUploads, removeUploadItem };
};
