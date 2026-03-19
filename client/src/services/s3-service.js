import axios from 'axios';

export const s3Service = {
    uploadToS3: async (url, chunk, onProgress) => {
        const response = await axios.put(url, chunk, {
            headers: {'Content-Type': 'application/octet-stream'},
            onUploadProgress: (e) => onProgress(e)
        })
        return response.headers.etag.replace(/"/g, '');
    }
}