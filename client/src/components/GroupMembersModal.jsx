import { useState, useEffect } from "react";
import {
  FaTimes,
  FaCrown,
  FaUserMinus,
  FaUserPlus,
  FaTrash,
} from "react-icons/fa";
import axios from "axios";
import { toast } from "react-toastify";
import AddMemberModal from "./AddMemberModal";
import ConfirmationModal from "./ConfirmationModal";
import { getUserDisplayName } from "../utils/getUserDisplayName";

const GroupMembersModal = ({ group, currentUser, onClose, onGroupUpdated }) => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [transferringAdmin, setTransferringAdmin] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    confirmText: "Xác nhận",
    isDangerous: false,
    onConfirm: null,
  });

  const API_URL = import.meta.env.VITE_API_URL;
  const token = localStorage.getItem("token");

  const adminId =
    group.admin && typeof group.admin === "object" ? group.admin._id : group.admin;
  const isAdmin = currentUser._id === adminId;

  useEffect(() => {
    if (group.members) {
      setMembers(group.members);
    }
  }, [group]);

  const closeConfirmModal = () =>
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

  const handleRemoveMember = async (memberId) => {
    const isCurrentUser = memberId === currentUser._id;

    if (isCurrentUser && isAdmin && members.length > 1) {
      setTransferringAdmin(true);
      toast.warning("Vui lòng chuyển quyền trưởng nhóm trước khi rời");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: isCurrentUser ? "Rời nhóm" : "Xóa thành viên",
      message: isCurrentUser
        ? "Bạn chắc chắn muốn rời nhóm này?"
        : "Bạn chắc chắn muốn xóa thành viên này khỏi nhóm?",
      type: "warning",
      confirmText: isCurrentUser ? "Rời nhóm" : "Xóa",
      isDangerous: false,
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await axios.post(
            `${API_URL}/api/groups/${group._id}/remove-member`,
            { memberId },
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (res.data.success) {
            if (isCurrentUser) {
              onClose();
            } else {
              toast.success("Xóa thành viên thành công");
              const updatedMembers = members.filter((member) => member._id !== memberId);
              setMembers(updatedMembers);
              onGroupUpdated?.({ ...group, members: updatedMembers });
            }
          }
        } catch (error) {
          toast.error(error.response?.data?.message || "Lỗi xóa thành viên");
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      },
    });
  };

  const handleTransferAdmin = async (newAdminId) => {
    const newAdminName =
      members.find((member) => member._id === newAdminId)?.displayName ||
      "người này";

    setConfirmModal({
      isOpen: true,
      title: "Chuyển quyền trưởng nhóm",
      message: `Bạn chắc chắn muốn chuyển quyền trưởng nhóm cho ${newAdminName}?`,
      type: "warning",
      confirmText: "Chuyển quyền",
      isDangerous: false,
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await axios.post(
            `${API_URL}/api/groups/${group._id}/transfer-admin`,
            { newAdminId },
            { headers: { Authorization: `Bearer ${token}` } },
          );

          if (res.data.success) {
            toast.success("Chuyển quyền trưởng nhóm thành công");
            const updatedGroup = res.data.group;
            if (updatedGroup) {
              setMembers(updatedGroup.members);
              onGroupUpdated?.(updatedGroup);
            }
            setTransferringAdmin(false);
          }
        } catch (error) {
          console.log(error);
          toast.error("Lỗi chuyển quyền trưởng nhóm");
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      },
    });
  };

  const handleDeleteGroup = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Giải tán nhóm",
      message:
        "Bạn chắc chắn muốn giải tán nhóm này không? Hành động này không thể hoàn tác.",
      type: "danger",
      confirmText: "Giải tán",
      isDangerous: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await axios.delete(`${API_URL}/api/groups/${group._id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.data.success) {
            toast.success("Giải tán nhóm thành công");
            onClose();
          }
        } catch (error) {
          toast.error(error.response?.data?.message || "Lỗi giải tán nhóm");
        } finally {
          setLoading(false);
          closeConfirmModal();
        }
      },
    });
  };

  const getAvatarUrl = (avatar) => {
    if (!avatar) return "https://via.placeholder.com/40";
    if (avatar.startsWith("http")) return avatar;
    return `${API_URL}/../${avatar}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-150 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold">Thành viên nhóm ({members.length})</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {members.map((member) => (
            <div
              key={member._id}
              className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-lg"
            >
              <div className="flex items-center space-x-3 overflow-hidden">
                <img
                  src={getAvatarUrl(member.avatar)}
                  alt={getUserDisplayName(member)}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center whitespace-nowrap">
                    <span className="truncate">{getUserDisplayName(member)}</span>
                    {member._id === adminId && (
                      <span className="ml-2 text-yellow-500 flex items-center gap-1 text-xs flex-shrink-0">
                        <FaCrown size={12} /> Trưởng nhóm
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                {isAdmin && member._id !== adminId && (
                  <>
                    <button
                      onClick={() => handleTransferAdmin(member._id)}
                      className="p-2 text-blue-500 hover:bg-blue-100 rounded-full transition-colors"
                      title="Chuyển quyền trưởng nhóm"
                      disabled={loading}
                    >
                      <FaCrown size={14} />
                    </button>
                    <button
                      onClick={() => handleRemoveMember(member._id)}
                      className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                      title="Xóa khỏi nhóm"
                      disabled={loading}
                    >
                      <FaUserMinus size={14} />
                    </button>
                  </>
                )}

                {isAdmin && member._id === currentUser._id && members.length > 1 && (
                  <button
                    onClick={() =>
                      transferringAdmin
                        ? toast.info("Vui lòng chọn người nhận quyền trước")
                        : handleRemoveMember(member._id)
                    }
                    className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                    title="Rời nhóm"
                    disabled={loading}
                  >
                    <FaUserMinus size={14} />
                  </button>
                )}

                {!isAdmin && member._id === currentUser._id && (
                  <button
                    onClick={() => handleRemoveMember(member._id)}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                    title="Rời nhóm"
                    disabled={loading}
                  >
                    <FaUserMinus size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-4 flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowAddMember(true)}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-medium"
              disabled={loading}
            >
              <FaUserPlus size={14} />
              Thêm thành viên
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleDeleteGroup}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-medium"
              disabled={loading}
            >
              <FaTrash size={14} />
              Giải tán nhóm
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            disabled={loading}
          >
            Đóng
          </button>
        </div>

        <AddMemberModal
          isOpen={showAddMember}
          onClose={() => setShowAddMember(false)}
          group={group}
          onAddSuccess={(updatedGroup) => {
            if (updatedGroup) {
              setMembers(updatedGroup.members);
              onGroupUpdated?.(updatedGroup);
            }
          }}
        />

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          type={confirmModal.type}
          confirmText={confirmModal.confirmText}
          isDangerous={confirmModal.isDangerous}
          isLoading={loading}
          onConfirm={() => confirmModal.onConfirm?.()}
          onCancel={closeConfirmModal}
        />
      </div>
    </div>
  );
};

export default GroupMembersModal;
