export const getSocketAuthState = ({
    isAuthenticated,
    isChecking,
    token,
    user,
    fallbackUser,
} = {}) => {
    if (isChecking) {
        return { shouldConnect: false, token: null, user: null };
    }

    if (!isAuthenticated) {
        return { shouldConnect: false, token: null, user: null };
    }

    const currentUser = user || fallbackUser || null;
    const currentToken = token || null;
    const userId = currentUser?._id || currentUser?.id || null;

    return {
        shouldConnect: Boolean(currentToken && userId),
        token: currentToken,
        user: currentUser,
    };
};
