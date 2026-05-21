export const getPresenceUserId = (targetUserOrId) => {
    if (typeof targetUserOrId === "object" && targetUserOrId !== null) {
        return targetUserOrId._id || targetUserOrId.id || targetUserOrId.userId || null;
    }

    return targetUserOrId || null;
};

export const isUserOnline = (onlineUsers = [], targetUserOrId) => {
    const targetUserId = getPresenceUserId(targetUserOrId);
    if (!targetUserId) return false;

    return onlineUsers.some(
        (user) => String(user.userId) === String(targetUserId),
    );
};
