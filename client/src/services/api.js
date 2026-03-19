import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Hàm lấy Token từ LocalStorage
const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };
};

export const initUpload = async (fileName, fileType, fileHash) => {
    const res = await axios.post(`${API_URL}/api/files/init`, {
        fileName,
        fileType,
        fileHash
    }, getAuthHeaders());

    return res.data;
};

export const getPresignedUrl = async (uploadId, key, partNumber) => {
    const res = await axios.post(`${API_URL}/api/files/get-presigned-url`, {
        uploadId,
        key,
        partNumber
    }, getAuthHeaders()); // <--- ĐÍNH KÈM TOKEN VÀO ĐÂY

    return res.data.url;
};

export const completeUpload = async (uploadId, key, parts, fileInfo) => {
    const res = await axios.post(`${API_URL}/api/files/complete`, {
        uploadId,
        key,
        parts,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fileSize: fileInfo.size,
        fileHash: fileInfo.hash
    }, getAuthHeaders());

    return res.data.file;
};