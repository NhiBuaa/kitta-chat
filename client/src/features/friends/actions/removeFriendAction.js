export const runRemoveFriendAction = async ({
    friendId,
    friendName = "người này",
    confirmRemove,
    removeFriend,
    toast,
    loadingRef,
    setLoading,
}) => {
    if (!friendId || typeof removeFriend !== "function") return { skipped: true };
    if (loadingRef?.current) return { skipped: true, duplicate: true };

    const confirmed = confirmRemove?.(
        `Bạn có chắc muốn hủy kết bạn với ${friendName}?`,
    );
    if (!confirmed) return { cancelled: true };

    if (loadingRef) loadingRef.current = true;
    setLoading?.(true);

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
    } finally {
        if (loadingRef) loadingRef.current = false;
        setLoading?.(false);
    }
};
