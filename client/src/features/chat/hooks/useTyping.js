import { useState, useRef, useEffect, useCallback } from "react";
import { SOCKET_EVENTS } from "@/constants/socketEvents.js";

/**
 * Quản lý trạng thái "đang nhập" (typing indicator).
 * Bao gồm:
 *  - Lắng nghe socket getTyping / getStopTyping
 *  - Reset khi đổi chat
 *  - handleInputChange (gộp setNewMessage + emit typing event)
 */
export const useTyping = ({
    socket,
    activeChat,
    currentUser,
    activeChatRef,
    setNewMessage,
    activeChatKey,
}) => {
    const [isTyping, setIsTyping] = useState(false);
    const [typingUserName, setTypingUserName] = useState("");
    const [typingUserAvatar, setTypingUserAvatar] = useState(null);
    const typingTimeoutRef = useRef(null);
    const [prevChatKey, setPrevChatKey] = useState(activeChatKey);

    if(activeChatKey !== prevChatKey) {
        setPrevChatKey(activeChatKey);
        setIsTyping(false);
        setTypingUserName("");
        setTypingUserAvatar(null);
    }

    // Socket listeners
    useEffect(() => {
        if (!socket) return;

        const handleTyping = ({ chatId, isGroup, senderId, senderName, senderAvatar }) => {
            if (!activeChatRef.current) return;
            if (senderId === currentUser?._id) return;
            if (activeChatRef.current._id !== chatId) return;

            setIsTyping(true);
            if (isGroup && senderName) {
                setTypingUserName(senderName);
                setTypingUserAvatar(senderAvatar);
            }
        };

        const handleStopTyping = ({ chatId, senderId }) => {
            if (!activeChatRef.current) return;
            if (senderId === currentUser?._id) return;
            if (activeChatRef.current._id !== chatId) return;

            setIsTyping(false);
            setTypingUserName("");
            setTypingUserAvatar(null);
        };

        socket.on(SOCKET_EVENTS.USER_TYPING_RECEIVE, handleTyping);
        socket.on(SOCKET_EVENTS.USER_STOP_TYPING_RECEIVE, handleStopTyping);

        return () => {
            socket.off(SOCKET_EVENTS.USER_TYPING_RECEIVE, handleTyping);
            socket.off(SOCKET_EVENTS.USER_STOP_TYPING_RECEIVE, handleStopTyping);
        };
    }, [socket, currentUser, activeChatRef]);

    // handleInputChange: cập nhật input + emit typing event
    const handleInputChange = useCallback((e) => {
        setNewMessage(e.target.value);
        if (!socket || !activeChat) return;

        const isGroup = Boolean(activeChat.members);

        socket.emit(SOCKET_EVENTS.USER_TYPING, {
            receiverId: activeChat._id,
            isGroup,
            senderId: currentUser._id,
            senderName: currentUser.displayName,
            senderAvatar: currentUser.avatar,
        });

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit(SOCKET_EVENTS.USER_STOP_TYPING, {
                receiverId: activeChat._id,
                isGroup,
                senderId: currentUser._id,
            });
        }, 2000);
    }, [socket, activeChat, currentUser, setNewMessage]);

    return { isTyping, typingUserName, typingUserAvatar, handleInputChange };
};
