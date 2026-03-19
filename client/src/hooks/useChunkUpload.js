import { compressImage } from '../utils/compression.js';
import { calculatedMD5 } from '../utils/hashing';
import { api } from '../services/api.js'
import { s3Service } from '../services/s3-service.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB cho mỗi CHUNK
const CONCURRENCY_LIMIT = 3; // Gửi một lúc tối đa 3 CHUNK

export const uploadFile = async (file, onProgress) => {
    // Sử dụng lại các util nén và bâm
    const compressed = await compressImage(file);
    const fileHash = await calculatedMD5(compressed);

    const { uploadId, key} = await api.initUpload({
        fileName: file.name,
        fileType: file.type,
        fileHash
    })

    const totalChunks = Math.ceil(compressed.size / CHUNK_SIZE);
    const completedParts = [];
    let uploadedBytes = 0;

    // Xử lý hàng đợi CHUNK
    const uploadChunk = async (partNumber) => {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, compressed.size);
        const chunk = compressed.splice(start, end);

        const signedUrl = await api.getPartSignedUrl({ uploadId, key, partNumber });

        let retries = 3;
        while (retries > 0) {
            try {
                const etag = await s3Service.uploadToS3(signedUrl, chunk, (p) => {
                    //Logic tính toán % mức độ thực tế
                    const currentProgress = uploadedBytes + p.loaded;
                    onProgress(Math.round((currentProgress / compressed.size) * 100));
                })

                uploadedBytes += chunk.size;
                return {ETag: etag, PartNumber: partNumber};
            } catch (e) {
                retries--;
                if (retries === 0) throw new Error(`Part ${partNumber} failed after 3 retries`);
                await new Promise(r => setTimeout(r, 100 * (3 - retries)));
                console.log('error upload image: ', e);
            }
        }
    }

    // Thực hiện upload song song
    const pool = new Set();
    for(let i = 1; i <= totalChunks; i++) {
        const task = uploadChunk(i).then(part => {
            completedParts.push(part);
            pool.delete(task);
        })
        pool.add(task);
        if(pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
    }
    await Promise.all(pool);

    return await api.completeUpload({ uploadId, key, parts: completedParts.sort((a, b) => a.PartNumber - b.PartNumber)});
}