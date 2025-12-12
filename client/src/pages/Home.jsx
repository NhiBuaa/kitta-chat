import { useState } from "react";
import { FaSearch, FaPaperPlane, FaPhone, FaVideo, FaInfoCircle, FaSmile } from "react-icons/fa";

const Home = () => {
    // Demo state (sau này sẽ lấy từ API)
    const [activeChat, setActiveChat] = useState(null);

    const users = [
        { id: 1, name: "Nguyễn Văn A", lastMsg: "Alo bạn ơi?", time: "10:30", avatar: "https://i.pravatar.cc/150?img=1", online: true },
        { id: 2, name: "Trần Thị B", lastMsg: "Gửi mình file nhé", time: "09:15", avatar: "https://i.pravatar.cc/150?img=5", online: false },
        { id: 3, name: "Team Dev", lastMsg: "Mai họp lúc 9h nhé", time: "Yesterday", avatar: "https://i.pravatar.cc/150?img=8", online: true },
    ];

    const handleLogout = () => {
        localStorage.removeItem("token");
        window.location.reload();
    };

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">

            {/* --- SIDEBAR --- */}
            <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
                {/* Header Sidebar */}
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-indigo-600 text-white">
                    <h1 className="text-xl font-bold">Chat App</h1>
                    <button onClick={handleLogout} className="text-xs bg-indigo-800 px-2 py-1 rounded hover:bg-indigo-900">Logout</button>
                </div>

                {/* Search */}
                <div className="p-4">
                    <div className="relative">
                        <FaSearch className="absolute top-3 left-3 text-gray-400" />
                        <input type="text" placeholder="Tìm kiếm..." className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                </div>

                {/* User List */}
                <div className="flex-1 overflow-y-auto">
                    {users.map((user) => (
                        <div
                            key={user.id}
                            onClick={() => setActiveChat(user)}
                            className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 transition ${activeChat?.id === user.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
                        >
                            <div className="relative">
                                <img src={user.avatar} alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
                                {user.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>}
                            </div>
                            <div className="ml-4 flex-1">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-800">{user.name}</h3>
                                    <span className="text-xs text-gray-400">{user.time}</span>
                                </div>
                                <p className="text-sm text-gray-500 truncate w-48">{user.lastMsg}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- CHAT WINDOW --- */}
            <div className="flex-1 flex flex-col bg-gray-50">
                {activeChat ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
                            <div className="flex items-center">
                                <img src={activeChat.avatar} className="w-10 h-10 rounded-full mr-3" />
                                <div>
                                    <h3 className="font-bold text-gray-800">{activeChat.name}</h3>
                                    <p className="text-xs text-green-500">{activeChat.online ? 'Đang hoạt động' : 'Offline'}</p>
                                </div>
                            </div>
                            <div className="flex space-x-4 text-indigo-600">
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaPhone /></button>
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaVideo /></button>
                                <button className="hover:bg-gray-100 p-2 rounded-full"><FaInfoCircle /></button>
                            </div>
                        </div>

                        {/* Messages Area (Demo) */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* Tin nhắn người khác */}
                            <div className="flex">
                                <img src={activeChat.avatar} className="w-8 h-8 rounded-full mr-2 mt-1" />
                                <div className="bg-white p-3 rounded-r-2xl rounded-bl-2xl shadow-sm max-w-xs text-gray-800 border border-gray-100">
                                    Chào bạn, lâu rồi không gặp!
                                </div>
                            </div>

                            {/* Tin nhắn của mình */}
                            <div className="flex justify-end">
                                <div className="bg-indigo-600 text-white p-3 rounded-l-2xl rounded-br-2xl shadow-md max-w-xs">
                                    Hi! Mình vẫn khỏe. Dạo này thế nào?
                                </div>
                            </div>
                        </div>

                        {/* Input Area */}
                        <div className="bg-white p-4 border-t border-gray-200">
                            <div className="flex items-center bg-gray-100 rounded-full px-4 py-2">
                                <button className="text-gray-500 hover:text-indigo-600 mr-3"><FaSmile size={20} /></button>
                                <input type="text" placeholder="Nhập tin nhắn..." className="flex-1 bg-transparent focus:outline-none" />
                                <button className="text-indigo-600 hover:text-indigo-800 ml-3"><FaPaperPlane size={20} /></button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                            <FaPaperPlane size={40} className="text-gray-400 ml-2" />
                        </div>
                        <p className="text-lg">Chọn một cuộc trò chuyện để bắt đầu</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default Home;