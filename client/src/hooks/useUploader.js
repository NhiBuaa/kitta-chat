import { useState } from 'react';
import { uploadFile } from './useChunkUpload';
import { toast } from 'react-toastify';

// BIẾN
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE = 30 * 1024 * 1024;

export const useUploader = () => {
    const [uploadQueue, setUploadQueue] = useState([]);

    const updateFileStatus = (id, updates) => {
        setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    };

    const startUpload = async (id, file) => {
        updateFileStatus(id, { status: 'uploading' });
        try {
            const result = await uploadFile(file, (percent) => {
                updateFileStatus(id, { progress: percent });
            });
            updateFileStatus(id, {
                status: 'completed',
                url: result.cdnUrl,
                dbFileId: result._id
            });
        } catch (error) {
            updateFileStatus(id, { status: 'error' });
            console.log("useUploader: ", error)
        }
    };

    // THÊM FILE VÀO QUÁ TRÌNH TẢI LÊN
    const addFiles = (files) => {
        const validFiles = [];

        // Lọc ra các file nào đáp ưng được các ràn buộc về dung lượng
        Array.from(files).forEach(file => {
            if (file.type.startsWith('video/') && file.size > MAX_VIDEO_SIZE) {
                toast.warning(`Video "${file.name}" vượt quá 50MB.`);
            } else if (!file.type.startsWith('video/') && !file.type.startsWith('image/') && file.size > MAX_FILE_SIZE) {
                toast.warning(`File "${file.name}" vượt quá 30MB.`);
            } else {
                validFiles.push(file);
            }
        })

        // Nếu không có file nào đáp ứng được thì return luôn
        if(validFiles.length === 0) return;

        const newEntries = validFiles.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            progress: 0,
            status: 'waiting', // waiting, uploading, completed, error
            url: null
        }));
        setUploadQueue(prev => [...prev, ...newEntries]);

        // Bắt đầu upload từng file
        newEntries.forEach(entry => startUpload(entry.id, entry.file));
    };

    const removeUploadItem = (id) => {
        setUploadQueue(prev => prev.filter(item => item.id !== id));
    };

    const clearUploads = () => setUploadQueue([]);
    return { uploadQueue, addFiles, clearUploads, removeUploadItem };
};