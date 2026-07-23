export const DEFAULT_SCROLL_FOLLOW_THRESHOLD = 150;

export const createScrollFollowState = ({
    threshold = DEFAULT_SCROLL_FOLLOW_THRESHOLD,
    initiallyFollowing = true,
} = {}) => {
    let isFollowingLatest = initiallyFollowing;

    return {
        markAtBottom() {
            isFollowingLatest = true;
        },
        updateFromDistance(
            distanceToBottom,
            { allowMovingAway = true } = {},
        ) {
            const isValidDistance = Number.isFinite(distanceToBottom);
            const isNearBottom = isValidDistance && distanceToBottom <= threshold;

            if (isNearBottom) {
                isFollowingLatest = true;
            } else if (allowMovingAway) {
                isFollowingLatest = false;
            }

            return isFollowingLatest;
        },
        shouldFollowMediaLoad() {
            return isFollowingLatest;
        },
    };
};
