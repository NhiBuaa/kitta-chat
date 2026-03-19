import { useState } from 'react';
import { uploadFile } from './useChunkUpload';

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

    const addFiles = (files) => {
        const newEntries = Array.from(files).map(file => ({
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