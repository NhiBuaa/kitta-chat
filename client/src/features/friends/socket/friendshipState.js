const toId = (value) => value?.toString?.() || String(value);

const isRemovedUser = (user, removedUserId) =>
    user?._id && removedUserId && toId(user._id) === toId(removedUserId);

const markAsRemovedFriend = (user = {}) => ({
    ...user,
    isFriend: false,
    isSent: false,
    isReceived: false,
    isIncomingRequest: false,
});

export const applyFriendRemovedToList = (
    list = [],
    { removedUserId, hadMessages, removeWhenNoMessages = true } = {},
) => {
    if (!removedUserId) return list;

    return list.reduce((next, user) => {
        if (!isRemovedUser(user, removedUserId)) {
            next.push(user);
            return next;
        }

        if (removeWhenNoMessages && hadMessages === false) {
            return next;
        }

        next.push(markAsRemovedFriend(user));
        return next;
    }, []);
};

export const applyFriendRemovedToActiveChat = (
    activeChat,
    { removedUserId } = {},
) => {
    if (!activeChat || activeChat.members || !isRemovedUser(activeChat, removedUserId)) {
        return activeChat;
    }

    return markAsRemovedFriend(activeChat);
};
