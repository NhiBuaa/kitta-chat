/**
 * PendingQueue – Quản lý tin nhắn đang trong trạng thái "sending" trong localStorage.
 *
 * Mục đích:
 * - Khi gửi tin: lưu vào localStorage với status = "sending"
 * - Khi server confirm (sent/error): xóa khỏi queue
 * - Khi app reload: đọc queue -> hiển thị status "error" cho các tin tồn đọng
 * - TTL: tự động xóa entry quá 24 giờ
 *
 * Shape của mỗi entry:
 * {
 *   idempotencyKey: string,     // UUID tạo ở client, STABLE qua các retry
 *   tempId: string,            // temp_${uuid} – dùng để map với UI state
 *   payload: Object,            // rawPayload – dùng để retry
 *   retryCount: number,         // số lần retry đã thử
 *   savedAt: number,            // Date.now() khi lưu
 * }
 */

const QUEUE_KEY = "msg_pending_queue";
const MAX_RETRY = 3;
const TTL_MS = 24 * 60 * 60 * 1000;

// ======================
// HELPERS 
// ======================

// Đọc queue từ localStorage, trả về array (mảng rỗng nếu lỗi hoặc không tồn tại)
function readQueue() {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// Ghi queue vào localStorage
function writeQueue(queue) {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
        console.warn("[PendingQueue] Lỗi ghi localStorage:", err);
    }
}

// ======================
// PUBLIC API
// ======================

/**
 * Thêm một tin đang gửi vào queue.
 * @param {Object} entry – { idempotencyKey, tempId, payload, retryCount }
 */
export function pendingQueueAdd(entry) {
    const queue = readQueue().filter(
        (item) => item.idempotencyKey !== entry.idempotencyKey
    );
    queue.push({
        ...entry,
        retryCount: entry.retryCount || 0,
        savedAt: Date.now(),
    });
    writeQueue(queue);
}

/**
 * Xóa một entry khỏi queue (khi server đã confirm sent).
 * @param {string} idempotencyKey
 */
export function pendingQueueRemove(idempotencyKey) {
    writeQueue(readQueue().filter((item) => item.idempotencyKey !== idempotencyKey));
}

/**
 * Cập nhật retryCount của một entry.
 * Trả về entry mới (đã tăng retryCount) hoặc null nếu đã đạt MAX_RETRY.
 * @param {string} idempotencyKey
 * @returns {Object|null}
 */
export function pendingQueueIncrementRetry(idempotencyKey) {
    const queue = readQueue();
    const idx = queue.findIndex((item) => item.idempotencyKey === idempotencyKey);

    if (idx === -1) return null;

    const entry = queue[idx];
    const newRetryCount = (entry.retryCount || 0) + 1;

    if (newRetryCount > MAX_RETRY) {
        // Đã retry đủ -> giữ nguyên entry, không tăng nữa
        return null;
    }

    queue[idx] = { ...entry, retryCount: newRetryCount };
    writeQueue(queue);
    return queue[idx];
}

/**
 * Đọc queue và trả về:
 * - expired: những entry quá 24h → đã bị xóa khỏi queue
 * - stale: những entry còn tồn đọng (chưa được confirm sau khi app reload)
 *
 * @returns {{ expired: Object[], stale: Object[], cleaned: Object[] }}
 */
export function pendingQueueGetStaleAndClean() {
    const now = Date.now();
    const queue = readQueue();

    const expired = [];  // > 24h -> auto-remove
    const stale = [];    // vẫn còn trong queue -> mark error

    const remaining = queue.filter((item) => {
        if (now - item.savedAt > TTL_MS) {
            expired.push(item);
            return false;
        }
        return true;
    });

    // Những entry có retryCount >= MAX_RETRY -> stale (hiện error)
    remaining.forEach((item) => {
        if ((item.retryCount || 0) >= MAX_RETRY) {
            stale.push(item);
        }
    });

    // Chỉ giữ lại những entry chưa đạt max retry (đang pending thực sự)
    const stillPending = remaining.filter(
        (item) => (item.retryCount || 0) < MAX_RETRY
    );

    writeQueue(stillPending);

    return { expired, stale, cleaned: expired };
}

/**
 * Kiểm tra xem một idempotencyKey có đang trong queue không.
 * @param {string} idempotencyKey
 * @returns {boolean}
 */
export function pendingQueueHas(idempotencyKey) {
    return readQueue().some((item) => item.idempotencyKey === idempotencyKey);
}

/**
 * Xóa toàn bộ queue (dùng khi logout).
 */
export function pendingQueueClearAll() {
    writeQueue([]);
}

export { MAX_RETRY };
