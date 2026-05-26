import { useEffect } from "react";
import { toast } from "react-toastify";

/**
 * Đăng ký tất cả socket listener liên quan đến nhóm chat:
 *  - groupUpserted, groupAdminChanged, groupRenamed
 *  - groupMemberUpdated, groupDeleted
 */
export const useGroupSocket = ({
    socket,
    currentUser,
    activeChat,
    groupsRef,
    setActiveChat,
    setGroups,
    setShowGroupMembers,
    upsertGroup,
}) => {
    useEffect(() => {
        if (!socket) return;

        // Nhóm được tạo mới hoặc cập nhật
        const handleGroupUpserted = (data) => {
            const { group, action, actorId, addedMemberId } = data || {};
            if (!group?._id || !currentUser?._id) return;

            const existedBefore = groupsRef.current.some((g) => g._id === group._id);
            upsertGroup(group);

            const isCurrentUserMember = group.members?.some((member) => {
                const memberId = typeof member === "object" ? member?._id : member;
                return memberId === currentUser._id;
            });
            if (isCurrentUserMember) {
                try { socket.emit("joinGroup", group._id); } catch (err) { console.error(err); }
            }

            const isCurrentUserAdded =
                action === "member-added" && addedMemberId === currentUser._id;
            const isInvitedWhenCreated =
                action === "created" &&
                actorId !== currentUser._id &&
                group.members?.some((m) => m._id === currentUser._id);

            if (!existedBefore && (isCurrentUserAdded || isInvitedWhenCreated)) {
                toast.info(`Bạn vừa được thêm vào nhóm "${group.name}"`, {
                    toastId: `group-upsert-${group._id}`,
                });
            }
        };

        // Admin nhóm thay đổi
        const handleGroupAdminChanged = ({ groupId, newAdminId }) => {
            setGroups((prev) =>
                prev.map((g) => (g._id === groupId ? { ...g, admin: newAdminId } : g))
            );
            setActiveChat((prev) =>
                prev?._id === groupId ? { ...prev, admin: newAdminId } : prev
            );
        };

        // Nhóm đổi tên / avatar
        const handleGroupRenamed = ({ groupId, newName, newAvatar }) => {
            setGroups((prev) =>
                prev.map((g) =>
                    g._id === groupId ? { ...g, name: newName, avatar: newAvatar } : g
                )
            );
            setActiveChat((prev) =>
                prev?._id === groupId ? { ...prev, name: newName, avatar: newAvatar } : prev
            );
        };

        // Thành viên thay đổi (thêm / xóa / rời)
        const handleGroupMemberUpdated = ({ groupId, updatedGroup, removedMemberId, isVoluntaryLeave }) => {
            if (removedMemberId === currentUser._id) {
                try { socket.emit("leaveGroup", groupId); } catch (err) { console.error(err); }

                if (activeChat?._id === groupId) {
                    setShowGroupMembers(false);
                    setActiveChat(null);
                }

                toast.info(isVoluntaryLeave ? "Bạn đã rời khỏi nhóm" : "Bạn đã bị xóa khỏi nhóm");
                setGroups((prev) => prev.filter((g) => g._id !== groupId));
                return;
            }

            if (updatedGroup) upsertGroup(updatedGroup);
        };

        // Nhóm bị xóa
        const handleGroupDeleted = ({ groupId }) => {
            if (activeChat?._id === groupId) {
                setShowGroupMembers(false);
                setActiveChat(null);
            }
            setGroups((prev) => prev.filter((g) => g._id !== groupId));
            try { socket.emit("leaveGroup", groupId); } catch (err) { console.error(err); }
        };

        socket.on("groupUpserted", handleGroupUpserted);
        socket.on("groupAdminChanged", handleGroupAdminChanged);
        socket.on("groupRenamed", handleGroupRenamed);
        socket.on("groupMemberUpdated", handleGroupMemberUpdated);
        socket.on("groupDeleted", handleGroupDeleted);

        return () => {
            socket.off("groupUpserted", handleGroupUpserted);
            socket.off("groupAdminChanged", handleGroupAdminChanged);
            socket.off("groupRenamed", handleGroupRenamed);
            socket.off("groupMemberUpdated", handleGroupMemberUpdated);
            socket.off("groupDeleted", handleGroupDeleted);
        };
    }, [socket, currentUser, activeChat, groupsRef, setActiveChat, setGroups, setShowGroupMembers, upsertGroup]);
};