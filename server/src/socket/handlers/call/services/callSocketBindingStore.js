const CALL_BINDING_TTL_SECONDS = 6 * 60 * 60;

const getCallSocketKey = (socketId) => `call:socket:${socketId}`;
const getCallUserKey = (userId) => `call:user:${userId}`;

const storeSocketCallBinding = async (socketId, callHistoryId, redisClient) => {
    await _storeBinding({
        redisClient,
        key: socketId ? getCallSocketKey(socketId) : null,
        value: callHistoryId,
        label: "socket",
    });
};

const storeUserActiveCall = async (userId, callHistoryId, redisClient) => {
    await _storeBinding({
        redisClient,
        key: userId ? getCallUserKey(userId) : null,
        value: callHistoryId,
        label: "user",
    });
};

const resolveSocketCallBinding = async (socketId, redisClient) => {
    return _resolveBinding({
        redisClient,
        key: socketId ? getCallSocketKey(socketId) : null,
        label: "socket",
    });
};

const resolveUserActiveCall = async (userId, redisClient) => {
    return _resolveBinding({
        redisClient,
        key: userId ? getCallUserKey(userId) : null,
        label: "user",
    });
};

const removeSocketCallBinding = async (socketId, redisClient) => {
    await _removeBinding({
        redisClient,
        key: socketId ? getCallSocketKey(socketId) : null,
        label: "socket",
    });
};

const removeUserActiveCall = async (userId, redisClient) => {
    await _removeBinding({
        redisClient,
        key: userId ? getCallUserKey(userId) : null,
        label: "user",
    });
};

const _storeBinding = async ({ redisClient, key, value, label }) => {
    if (!redisClient || !key || !value) return;

    try {
        await redisClient.setEx(key, CALL_BINDING_TTL_SECONDS, String(value));
    } catch (err) {
        console.warn(`[callSocketBindingStore] Failed to store ${label} binding:`, err.message);
    }
};

const _resolveBinding = async ({ redisClient, key, label }) => {
    if (!redisClient || !key) return null;

    try {
        return await redisClient.get(key);
    } catch (err) {
        console.warn(`[callSocketBindingStore] Failed to resolve ${label} binding:`, err.message);
        return null;
    }
};

const _removeBinding = async ({ redisClient, key, label }) => {
    if (!redisClient || !key) return;

    try {
        await redisClient.del(key);
    } catch (err) {
        console.warn(`[callSocketBindingStore] Failed to remove ${label} binding:`, err.message);
    }
};

module.exports = {
    CALL_BINDING_TTL_SECONDS,
    getCallSocketKey,
    getCallUserKey,
    storeSocketCallBinding,
    storeUserActiveCall,
    resolveSocketCallBinding,
    resolveUserActiveCall,
    removeSocketCallBinding,
    removeUserActiveCall,
};
