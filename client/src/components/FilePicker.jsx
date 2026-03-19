import { useUploader } from '../hooks/useUploader';
import { UploadItem } from './UploadItem';

export const FilePicker = () => {
    const { uploadQueue, addFiles } = useUploader();

    const handleDrop = (e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
    };

    return (
        <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg"
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}>
            <input type="file" multiple onChange={(e) => addFiles(e.target.files)} className="mb-4" />
            <div className="space-y-3">
                {uploadQueue.map(item => <UploadItem key={item.id} item={item} />)}
            </div>
        </div>
    );
};