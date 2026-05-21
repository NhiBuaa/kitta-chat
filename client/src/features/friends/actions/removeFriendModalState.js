export const createClosedRemoveFriendModalState = () => ({
    isOpen: false,
    targetUser: null,
    isLoading: false,
});

export const openRemoveFriendModal = (user) => ({
    isOpen: Boolean(user?._id),
    targetUser: user?._id ? user : null,
    isLoading: false,
});

export const closeRemoveFriendModal = (state) => {
    if (state?.isLoading) return state;
    return createClosedRemoveFriendModalState();
};

export const startRemoveFriendSubmit = (state) => {
    if (!state?.isOpen || !state?.targetUser || state?.isLoading) {
        return { state, shouldSubmit: false };
    }

    return {
        state: { ...state, isLoading: true },
        shouldSubmit: true,
    };
};

export const finishRemoveFriendSubmit = (state, { closeOnSuccess = false } = {}) => {
    if (closeOnSuccess) return createClosedRemoveFriendModalState();
    return { ...state, isLoading: false };
};
