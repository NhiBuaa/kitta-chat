// Dùng để xử lý trạng thái hoạt động
export const formatTimeAgo = (dateString) => {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    // Xử lý các mốc thời gian
    if (diffInSeconds < 60) {
        return '';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} phút trước`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} giờ trước`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} ngày trước`;
    }

    // Nếu quá 7 ngày thì hiện ngày tháng cụ thể
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

// Dùng để sử lý bộ đếm thời gian khi gọi
export const formatDuration = (totalSecond) => {
    if(isNaN(totalSecond) || totalSecond < 0) return "00:00";

    const minutes = Math.floor(totalSecond / 60).toString().padStart(2, '0');
    const seconds = (totalSecond % 60).toString().padStart(2, '0');

    return `${minutes}:${seconds}`
}