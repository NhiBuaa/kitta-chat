// NÉN ẢNH
import imageCompression from 'browser-image-compression';

export const compressImage = async (file) => {
    if (!file.type.startsWith('image/')) return file;
    const options = {maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true};
    return await imageCompression(file, options);
}