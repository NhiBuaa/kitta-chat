import { useState, useEffect } from 'react';

export const PreviewMedia = ({ file }) => {
    const [preview, setPreview] = useState(null);

    useEffect(() => {
        // LỚP BẢO VỆ 1: Phải là định dạng File hoặc Blob thì mới tạo URL được
        if (!file || !(file instanceof File || file instanceof Blob)) {
            return;
        }

        try {
            const url = URL.createObjectURL(file);
            // eslint-disable-next-line react-hooks/exhaustive-deps
            setPreview(url);

            return () => URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Lỗi tạo preview:", error);
        }
    }, [file]);

    // LỚP BẢO VỆ 2: Đã có dấu ?. an toàn
    if (file?.type?.startsWith('image/')) {
        return <img src={preview} alt="preview" className="w-16 h-16 object-cover rounded" />;
    }
    if (file?.type?.startsWith('video/')) {
        return <video src={preview} className="w-16 h-16 object-cover rounded" />;
    }

    return <div className="w-16 h-16 bg-gray-200 flex items-center justify-center text-xs">DOC</div>;
};