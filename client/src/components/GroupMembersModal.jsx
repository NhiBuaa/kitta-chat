import { useState, useEffect } from "react";
import { FaTimes, FaCrown, FaUserMinus, FaUserPlus } from "react-icons/fa";
import axios from "axios";
import { toast } from "react-toastify";

const GroupMembersModal = ({ group, currentUser, onClose, onGroupUpdated }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [friends, setFriends] = useState([]);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [transferringAdmin, setTransferringAdmin] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL;
    const token = localStorage.getItem('token');
    const isAdmin = currentUser._id === group.admin._id;

    useEffect(() => {
        if (group.members) {
            setMembers(group.members);
        }
    }, [group]);

    // Lấy danh sách bạn bè chưa là thành viên
    const loadFriends = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/users/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const friendsNotInGroup = res.data.friends.filter(
                f => !group.members.some(m => m._id === f._id)
            );
            setFriends(friendsNotInGroup);
            setShowAddMember(true);
        } catch (error) {
            console.error("Lỗi tải bạn bè:", error);
            
        }
    };

    // Thêm thành viên
    const handleAddMember = async () => {
        if (!selectedFriend) {
            toast.warning("Vui lòng chọn bạn bè để thêm");
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post(
                `${API_URL}/api/groups/${group._id}/add-member`,
                { memberId: selectedFriend._id },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data.success) {
                toast.success("Thêm thành viên thành công");
                // Reload group data
                const groupRes = await axios.get(`${API_URL}/api/groups`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const updatedGroup = groupRes.data.groups.find(g => g._id === group._id);
                if (updatedGroup) {
                    setMembers(updatedGroup.members);
                    onGroupUpdated?.(updatedGroup);
                }
                setShowAddMember(false);
                setSelectedFriend(null);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Lỗi thêm thành viên");
        } finally {
            setLoading(false);
        }
    };

    // Xóa/Rời nhóm
    const handleRemoveMember = async (memberId) => {
        if (!window.confirm(
            memberId === currentUser._id 
                ? "Bạn chắc chắn muốn rời nhóm?" 
                : "Xóa thành viên này khỏi nhóm?"
        )) {
            return;
        }

        // Nếu là admin muốn rời thì phải chuyển quyền trước
        if (isAdmin && memberId === currentUser._id && members.length > 1) {
            setTransferringAdmin(true);
            toast.warning("Vui lòng chuyển quyền trưởng nhóm trước khi rời");
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post(
                `${API_URL}/api/groups/${group._id}/remove-member`,
                { memberId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data.success) {
                if (memberId === currentUser._id) {
                    toast.success("Bạn đã rời nhóm");
                    onClose();
                } else {
                    toast.success("Xóa thành viên thành công");
                    const updatedMembers = members.filter(m => m._id !== memberId);
                    setMembers(updatedMembers);
                    onGroupUpdated?.({ ...group, members: updatedMembers });
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Lỗi xóa thành viên");
        } finally {
            setLoading(false);
        }
    };

    // Chuyển quyền trưởng nhóm
    const handleTransferAdmin = async (newAdminId) => {
        if (!window.confirm("Chuyển quyền trưởng nhóm cho người này?")) {
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post(
                `${API_URL}/api/groups/${group._id}/transfer-admin`,
                { newAdminId },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data.success) {
                toast.success("Chuyển quyền trưởng nhóm thành công");
                const updatedGroup = res.data.group;
                setMembers(updatedGroup.members);
                onGroupUpdated?.(updatedGroup);
                setTransferringAdmin(false);
                // Sau khi chuyển quyền, người dùng có thể rời nhóm
                setTimeout(() => handleRemoveMember(currentUser._id), 1000);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Lỗi chuyển quyền");
        } finally {
            setLoading(false);
        }
    };

    const getAvatarUrl = (avatar) => {
        if (!avatar) return "https://via.placeholder.com/40";
        if (avatar.startsWith('http')) return avatar;
        return `${API_URL}/../${avatar}`;
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-96 max-h-96 flex flex-col">
                {/* Header */}
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

                {/* Member List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {members.map((member) => (
                        <div
                            key={member._id}
                            className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-lg"
                        >
                            <div className="flex items-center space-x-2">
                                <img
                                    src={getAvatarUrl(member.avatar)}
                                    alt={member.displayName}
                                    className="w-8 h-8 rounded-full object-cover"
                                />
                                <div>
                                    <p className="text-sm font-medium">
                                        {member.displayName || member.email.split('@')[0]}
                                        {member._id === group.admin._id && (
                                            <span className="ml-2 text-yellow-500">
                                                <FaCrown className="inline" size={12} /> Trưởng
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-gray-500">{member.email}</p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                {/* Admin: Chuyển quyền hoặc xóa */}
                                {isAdmin && member._id !== group.admin._id && (
                                    <>
                                        <button
                                            onClick={() => handleTransferAdmin(member._id)}
                                            className="p-1 text-blue-500 hover:bg-blue-100 rounded-full text-sm"
                                            title="Chuyển quyền"
                                            disabled={loading}
                                        >
                                            <FaCrown size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleRemoveMember(member._id)}
                                            className="p-1 text-red-500 hover:bg-red-100 rounded-full"
                                            title="Xóa khỏi nhóm"
                                            disabled={loading}
                                        >
                                            <FaUserMinus size={14} />
                                        </button>
                                    </>
                                )}

                                {/* Admin: Xóa chính mình (hiện trạng giao đó là chuyển quyền trước) */}
                                {isAdmin && member._id === currentUser._id && members.length > 1 && (
                                    <button
                                        onClick={() =>
                                            transferringAdmin
                                                ? toast.info("Vui lòng chọn người chuẩn bị nhận quyền")
                                                : handleRemoveMember(member._id)
                                        }
                                        className="p-1 text-red-500 hover:bg-red-100 rounded-full"
                                        title="Rời nhóm"
                                        disabled={loading}
                                    >
                                        <FaUserMinus size={14} />
                                    </button>
                                )}

                                {/* Thành viên bình thường: Rời nhóm */}
                                {!isAdmin && member._id === currentUser._id && (
                                    <button
                                        onClick={() => handleRemoveMember(member._id)}
                                        className="p-1 text-red-500 hover:bg-red-100 rounded-full"
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

                {/* Footer */}
                <div className="border-t p-4 flex gap-2">
                    {isAdmin && (
                        <button
                            onClick={loadFriends}
                            className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                            disabled={loading}
                        >
                            <FaUserPlus size={14} />
                            Thêm thành viên
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                        disabled={loading}
                    >
                        Đóng
                    </button>
                </div>

                {/* Add Member Modal */}
                {showAddMember && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                        <div className="bg-white rounded-lg p-4 w-80">
                            <h3 className="text-lg font-bold mb-4">Chọn bạn bè để thêm</h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                                {friends.length === 0 ? (
                                    <p className="text-gray-500 text-center text-sm">
                                        Không có bạn bè nào để thêm
                                    </p>
                                ) : (
                                    friends.map((friend) => (
                                        <button
                                            key={friend._id}
                                            onClick={() => setSelectedFriend(friend)}
                                            className={`w-full flex items-center space-x-2 p-2 rounded ${
                                                selectedFriend?._id === friend._id
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-gray-100 hover:bg-gray-200'
                                            }`}
                                        >
                                            <img
                                                src={getAvatarUrl(friend.avatar)}
                                                alt={friend.displayName}
                                                className="w-6 h-6 rounded-full object-cover"
                                            />
                                            <span className="text-sm">
                                                {friend.displayName || friend.email.split('@')[0]}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddMember}
                                    className="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                                    disabled={!selectedFriend || loading}
                                >
                                    Thêm
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAddMember(false);
                                        setSelectedFriend(null);
                                    }}
                                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded hover:bg-gray-400"
                                    disabled={loading}
                                >
                                    Hủy
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GroupMembersModal;
