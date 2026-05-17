import { FaTimes, FaExclamationTriangle, FaCheckCircle, FaInfoCircle } from "react-icons/fa";

const ConfirmationModal = ({ 
    isOpen, 
    title, 
    message, 
    type = "warning", // "warning", "danger", "info", "success"
    confirmText = "Xác nhận", 
    cancelText = "Hủy",
    onConfirm, 
    onCancel,
    isLoading = false,
    isDangerous = false
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case "danger":
                return <FaExclamationTriangle className="text-red-500 text-4xl" />;
            case "success":
                return <FaCheckCircle className="text-green-500 text-4xl" />;
            case "info":
                return <FaInfoCircle className="text-blue-500 text-4xl" />;
            case "warning":
            default:
                return <FaExclamationTriangle className="text-yellow-500 text-4xl" />;
        }
    };

    const getConfirmButtonColor = () => {
        if (isDangerous) return "bg-red-600 hover:bg-red-700 text-white";
        if (type === "danger") return "bg-red-600 hover:bg-red-700 text-white";
        if (type === "success") return "bg-green-600 hover:bg-green-700 text-white";
        return "bg-blue-600 hover:bg-blue-700 text-white";
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                    <div className="flex items-center space-x-3">
                        {getIcon()}
                        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        disabled={isLoading}
                    >
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-gray-700 leading-relaxed text-center">
                        {message}
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="px-6 py-2 rounded-lg font-medium text-gray-700 bg-white border-2 border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getConfirmButtonColor()}`}
                    >
                        {isLoading ? "Đang xử lý..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
