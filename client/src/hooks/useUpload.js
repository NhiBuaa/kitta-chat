import axios from 'axios';
import { initUpload, getPresignedUrl, completeUpload } from '@/services/api/fileApi.js';

// BIẾN
const VITE_API_URL_FILES = import.meta.env.VITE_API_URL_FILES || '/api/files';

export const uploadFileChunked = async (file, onProgress) => {
    const { uploadId, key } = await initUpload(file.name, file.type, "");

    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const parts = [];
    let uploadedSize = 0;

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const partNumber = i + 1;

        const url = await getPresignedUrl(uploadId, key, partNumber);

        const uploadRes = await axios.put(url, chunk, {
            headers: { 'Content-Type': file.type }
        });

        parts.push({
            ETag: uploadRes.headers.etag.replace(/"/g, ''),
            PartNumber: partNumber
        });

        // Cập nhật thanh tiến trình
        uploadedSize += chunk.size;
        if (onProgress) {
            onProgress(Math.round((uploadedSize / file.size) * 100));
        }
    }

    const fileInfo = { name: file.name, type: file.type, size: file.size, hash: "" };
    const completedFile = await completeUpload(uploadId, key, parts, fileInfo);

    return completedFile;
};

export const uploadFileSingle = async (file, onProgress) => {
    try {
        // Tạo form dữ liệu
        const formData = new FormData();
        formData.append("file", file);
        
        // Lấy token để gửi kèm header
        const token = localStorage.getItem('token');

        // Gọi API upload single ở BE
        const response = await axios.post(`${VITE_API_URL_FILES}/upload-single`, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
                "Authorization": `Bearer ${token}`,
            },
            onUploadProgress: (progressEvent) => {
                if (onProgress) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    onProgress(percentCompleted);
                }
            }
        });

        return response.data.file;
    } catch (err) {
        console.error("Lỗi uploadFileSingle:", err);
        throw err;
    }
}