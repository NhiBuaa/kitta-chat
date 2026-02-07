import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaTimes, FaCheck } from 'react-icons/fa';

const CreateGroupModal = ({ isOpen, onClose, users, onCreateSuccess }) => {
    const [groupName, setGroupName] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const API_URL = import.meta.env.VITE_API_URL;

    if (!isOpen) return null;

    const toggleMember = (userId) => {
        setSelectedMembers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const getAvatarUrl = (avatarPath) => {
        if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
        if (avatarPath.startsWith('http')) return avatarPath;
        return `${API_URL}${avatarPath}`;
    };

    const handleSubmit = async () => {
        if (!groupName.trim()) return toast.warning("Nhập tên nhóm!");
        if (selectedMembers.length < 2) return toast.warning("Chọn ít nhất 2 thành viên khác!");

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/api/groups`, {
                name: groupName,
                members: selectedMembers
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.success) {
                toast.success("Tạo nhóm thành công!");
                onCreateSuccess(res.data.group);
                onClose();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Lỗi tạo nhóm");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center bg-blue-600 text-white">
                    <h3 className="font-bold">Tạo nhóm mới</h3>
                    <button onClick={onClose} className='text-white hover:text-red-500 transition'><FaTimes /></button>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                    {/* Tên nhóm */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tên nhóm</label>
                        <input
                            type="text"
                            className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Ví dụ: Team Dev..."
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                        />
                    </div>

                    {/* Danh sách thành viên */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Thêm thành viên ({selectedMembers.length})</label>
                        <div className="space-y-2">
                            {users.map(user => (
                                <div
                                    key={user._id}
                                    onClick={() => toggleMember(user._id)}
                                    className={`flex items-center p-2 rounded cursor-pointer border transition ${selectedMembers.includes(user._id)
                                        ? 'bg-blue-50 border-blue-500'
                                        : 'hover:bg-gray-50 border-gray-200'
                                        }`}
                                >
                                    <img src={getAvatarUrl(user.avatar)} className="w-8 h-8 rounded-full mr-3 object-cover" />
                                    <span className="flex-1 text-sm font-medium">{user.displayName}</span>
                                    {selectedMembers.includes(user._id) && <FaCheck className="text-blue-600" />}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? "Đang tạo..." : "Xác nhận tạo nhóm"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateGroupModal;