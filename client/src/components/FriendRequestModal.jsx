// src/components/FriendRequestModal.jsx
import { useEffect, useState } from 'react';
import { getFriendRequests, acceptFriendRequest } from '../services/userService';

const FriendRequestModal = ({ onClose, onAcceptSuccess }) => {
    const [requests, setRequests] = useState([]);

    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const res = await getFriendRequests();
                setRequests(res.data.requests);
            } catch (error) {
                console.error(error);
            }
        };
        fetchRequests();
    }, []);

    const handleAccept = async (senderId) => {
        try {
            await acceptFriendRequest(senderId);
            // Xóa người đó khỏi list hiển thị
            setRequests(requests.filter(req => req._id !== senderId));
            // Gọi callback để Sidebar load lại danh sách bạn bè
            onAcceptSuccess();
            alert("Đã trở thành bạn bè!");
        } catch (error) {
            console.error(error);
            alert("Lỗi khi đồng ý kết bạn");
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-btn" onClick={onClose}>X</button>
                <h3>Lời mời kết bạn ({requests.length})</h3>

                <div className="request-list">
                    {requests.length === 0 ? <p>Không có lời mời nào.</p> : null}
                    {requests.map(user => (
                        <div key={user._id} className="request-item">
                            <div className="info">
                                <img src={user.avatar} alt="avt" className="avatar-mini" />
                                <strong>{user.displayName}</strong>
                            </div>
                            <button className="accept-btn" onClick={() => handleAccept(user._id)}>
                                Đồng ý
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FriendRequestModal;