import axios from 'axios';
import { initUpload, getPresignedUrl, completeUpload } from '../services/api';

export const uploadFile = async (file, onProgress) => {
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