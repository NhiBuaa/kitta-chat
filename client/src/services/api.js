import axios from 'axios';

const API_BASE = '/api/files'; // Sửa lại để khớp với route

export const api = {
    // Khởi tạo quá trình Multipart
    initUpload: async ({ fileName, fileType, fileHash }) => {
        const { data } = await axios.post(`${API_BASE}/init`, { fileName, fileType, fileHash });
        return data;
    },
    // Lấy Signed URL cho từng chunk
    getPartSignedUrl: async ({ uploadId, key, partNumber }) => {
        const { data } = await axios.post(`${API_BASE}/get-presigned-url`, { uploadId, key, partNumber });
        return data.url;
    },
    // Báo cáo hoàn tất để Backend ghép file
    completeUpload: async ({ uploadId, key, parts }) => {
        const { data } = await axios.post(`${API_BASE}/complete`, { uploadId, key, parts });
        return data.file; // Metadata của file trong DB
    }
}