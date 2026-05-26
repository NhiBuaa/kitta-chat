import { axiosClient } from '@/services/api/axiosClient.js';

const API_URL = import.meta.env.VITE_API_URL_FILES || '/api/files';

export const initUpload = async (fileName, fileType, fileHash) => {
    const res = await axiosClient.post(`${API_URL}/init`, {
        fileName,
        fileType,
        fileHash
    });

    return res.data;
};

export const getPresignedUrl = async (uploadId, key, partNumber) => {
    const res = await axiosClient.post(`${API_URL}/get-presigned-url`, {
        uploadId,
        key,
        partNumber
    });

    return res.data.url;
};

export const completeUpload = async (uploadId, key, parts, fileInfo) => {
    const res = await axiosClient.post(`${API_URL}/complete`, {
        uploadId,
        key,
        parts,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fileSize: fileInfo.size,
        fileHash: fileInfo.hash
    });

    return res.data.file;
};