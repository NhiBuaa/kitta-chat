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