export const runRemoveFriendAction = async ({
    friendId,
    removeFriend,
    toast,
}) => {
    if (!friendId || typeof removeFriend !== "function") return { skipped: true };

    try {
        const response = await removeFriend(friendId);
        const alreadyRemoved = Boolean(response?.data?.alreadyRemoved);

        if (alreadyRemoved) {
            toast?.info?.("Hai bạn hiện không còn là bạn bè.");
        } else {
            toast?.success?.("Đã hủy kết bạn.");
        }

        return { success: true, alreadyRemoved };
    } catch (error) {
        toast?.error?.(
            error?.response?.data?.message || "Không thể hủy kết bạn. Vui lòng thử lại.",
        );
        return { success: false, error };
    }
};
