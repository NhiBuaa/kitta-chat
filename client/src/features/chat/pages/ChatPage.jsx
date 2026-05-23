import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import { SOCKET_EVENTS } from "@/constants/socketEvents.js";
import { getGroups } from "@/services/api/groupApi.js";
import { getFriendRequests } from "@/services/api/friendApi.js";
import { getSidebarUsers, getUserProfile } from "@/services/api/userApi.js";
import { useAuth } from "@/services/auth/AuthProvider.jsx";

// Components
import Sidebar from "@/components/layout/Sidebar.jsx";
import ChatWindow from "@/features/chat/components/ChatWindow.jsx";
import UserProfileSidebar from "@/features/profile/components/UserProfileSidebar.jsx";
import CreateGroupModal from "@/features/groups/components/CreateGroupModal.jsx";
import FriendRequestModal from "@/features/friends/components/FriendRequestModal.jsx";
import GroupMembersModal from "@/features/groups/components/GroupMembersModal.jsx";
import ChatInput from "@/features/chat/components/ChatInput.jsx";
import { FilePicker } from "@/features/chat/components/FilePicker.jsx";
import Loader from "@/components/common/Loader.jsx";
import CallHistoryModal from "@/features/calls/components/CallHistoryModal.jsx";

// Context & Services
import { useSocket } from "@/services/socket/SocketContext.js";
import { useUploader } from "@/hooks/useUploader.js";

// Custom Hooks
import { useFriendActions } from "@/features/friends/hooks/useFriendActions.js";
import {
  applyFriendRemovedToActiveChat,
  applyFriendRemovedToList,
} from "@/features/friends/socket/friendshipState.js";
import { useSearch } from "@/hooks/useSearch.js";
import { useScrollBehavior } from "@/features/chat/hooks/useScrollBehavior.js";
import { useChatMessages } from "@/features/chat/hooks/useChatMessages.js";
import { useTyping } from "@/features/chat/hooks/useTyping.js";
import { useFriendSocket } from "@/features/friends/socket/useFriendSocket.js";
import { useGroupSocket } from "@/features/groups/socket/useGroupSocket.js";
import { useMessageSocket } from "@/features/chat/socket/useMessageSocket.js";
import { usePresence } from "@/features/profile/hooks/usePresence.js";

const Home = () => {
  // Core state
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeChat, setActiveChat] = useState(null);

  // Sidebar / list state
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [requestCount, setRequestCount] = useState(0);

  // Search state (lifted để dùng trong patchUserEverywhere)
  const [searchResult, setSearchResult] = useState([]);

  // UI modal state
  const [showProfile, setShowProfile] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showCallHistoryModal, setShowCallHistoryModal] = useState(false);

  // Refs (dùng trong closures của socket handlers)
  const activeChatRef = useRef(null);
  const groupsRef = useRef([]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // Context / global hooks
  const { onlineUsers, socket } = useSocket();
  const { token, isChecking, isAuthenticated, logout } = useAuth();
  const { uploadQueue, addFiles, clearUploads, removeUploadItem } = useUploader();

  const API_URL_USERS = import.meta.env.VITE_API_URL_USERS || '/api/users';

  // Computed values
  const currentChatUser = activeChat
    ? activeChat.members
      ? activeChat
      : users.find((u) => u._id === activeChat._id) || activeChat
    : null;

  const activeChatId = activeChat?._id || null;
  const activeChatIsGroup = Boolean(activeChat?.members);
  const activeChatKey = activeChatId
    ? `${activeChatIsGroup ? "group" : "user"}:${activeChatId}`
    : null;

  // Utility fns
  const getAvatarUrl = useCallback((avatarPath) => {
    if (!avatarPath) return import.meta.env.VITE_DEFAULT_AVATAR;
    if (/^(https?:|blob:|data:)/.test(avatarPath)) return avatarPath;
    return `/uploads${avatarPath}`;
  }, []);

  const { checkIsOnline } = usePresence();

  const renderLastMessage = (user, currentUserId) => {
    if (!user.lastMessage)
      return <span className="text-gray-400 italic">Bắt đầu trò chuyện</span>;
    const { content, senderId } = user.lastMessage;
    const isMe = senderId === currentUserId;
    return (
      <span
        className={
          user.hasUnread ? "text-gray-900 font-semibold" : "text-gray-500"
        }
      >
        {isMe ? "Bạn: " : ""}
        {content}
      </span>
    );
  };

  // upsertGroup
  const upsertGroup = useCallback((incomingGroup) => {
    if (!incomingGroup?._id) return;
    setGroups((prev) => {
      const idx = prev.findIndex((g) => g._id === incomingGroup._id);
      if (idx === -1) return [incomingGroup, ...prev];
      const merged = {
        ...prev[idx],
        ...incomingGroup,
        members: incomingGroup.members || prev[idx].members,
        admin: incomingGroup.admin || prev[idx].admin,
      };
      const next = [...prev];
      next.splice(idx, 1);
      next.unshift(merged);
      return next;
    });
    if (activeChatRef.current?._id === incomingGroup._id) {
      setActiveChat((prev) =>
        prev
          ? {
              ...prev,
              ...incomingGroup,
              members: incomingGroup.members || prev.members,
              admin: incomingGroup.admin || prev.admin,
            }
          : prev,
      );
    }
  }, []);

  // Friend actions hook
  const {
    fetchNewConversation,
    patchUsers,
    markFriendshipActive,
    markFriendRequestSent,
    clearSentFriendRequest,
    handleAddFriend,
  } = useFriendActions({ API_URL: API_URL_USERS, setUsers, setActiveChat, setSentRequests });

  // Compose patchUserEverywhere: patches users + searchResult + activeChat
  const patchUserEverywhere = useCallback(
    (targetUserId, updater) => {
      if (!targetUserId) return;
      patchUsers(targetUserId, updater);
      setSearchResult((prev) =>
        prev.map((u) => (u?._id === targetUserId ? updater(u) : u)),
      );
    },
    [patchUsers],
  );

  const markFriendshipRemoved = useCallback((payload) => {
    const removedUserId = payload?.removedUserId;
    if (!removedUserId) return;

    setUsers((prev) => applyFriendRemovedToList(prev, payload));
    setSearchResult((prev) => applyFriendRemovedToList(prev, {
      ...payload,
      removeWhenNoMessages: false,
    }));
    setActiveChat((prev) => applyFriendRemovedToActiveChat(prev, payload));
  }, [setUsers, setSearchResult, setActiveChat]);

  useEffect(() => {
    const handleAvatarUpdated = (event) => {
      const updatedUser = event.detail?.user;
      const updatedUserId = updatedUser?._id || updatedUser?.id;
      if (!updatedUserId) return;

      const applyUserUpdate = (user) => ({ ...user, ...updatedUser });
      const currentUserId = currentUser?._id || currentUser?.id;

      if (String(updatedUserId) === String(currentUserId)) {
        setCurrentUser((prev) => (prev ? applyUserUpdate(prev) : updatedUser));
      }

      patchUserEverywhere(String(updatedUserId), applyUserUpdate);
    };

    window.addEventListener("avatar-updated", handleAvatarUpdated);
    return () => window.removeEventListener("avatar-updated", handleAvatarUpdated);
  }, [currentUser, patchUserEverywhere]);

  // Search hook
  const { searchTerm, setSearchTerm, isSearching, usersToDisplay } = useSearch({
    API_URL: API_URL_USERS, users, searchResult, setSearchResult,
  });

  // Scroll hook
  const {
    scrollRef,
    bottomRef,
    hasNewUnread,
    setHasNewUnread,
    scrollChatToBottom,
    handleScrollToBottom,
    armAutoScrollLock,
    handleMediaContentLoad,
    handleUserMovedAwayFromBottom,
  } = useScrollBehavior();

  // Messages hook
  const {
    messages,
    setMessages,
    newMessage,
    setNewMessage,
    isLoadingMore,
    isChatBootstrapping,
    handleSendMessage,
    handleRetryMessage,
    loadMoreMessages,
    resetChatState,
  } = useChatMessages({
    activeChat, currentUser, socket,
    uploadQueue, clearUploads, armAutoScrollLock, scrollRef,
    setHasNewUnread, setUsers, fetchNewConversation, scrollChatToBottom, setShowEmoji,
  });

  // Typing hook
  const { isTyping, typingUserName, typingUserAvatar, handleInputChange } =
    useTyping({
      socket,
      activeChat,
      currentUser,
      activeChatRef,
      newMessage,
      setNewMessage,
      activeChatKey,
    });

  // Socket hooks
  useFriendSocket({
    socket,
    currentUser,
    setRequestCount,
    patchUserEverywhere,
    markFriendRequestSent,
    markFriendshipActive,
    clearSentFriendRequest,
    markFriendshipRemoved,
  });

  useGroupSocket({
    socket,
    currentUser,
    activeChat,
    groupsRef,
    setActiveChat,
    setGroups,
    setShowGroupMembers,
    upsertGroup,
  });

  useMessageSocket({
    socket, currentUser, activeChatRef,
    setMessages, setUsers, setGroups, setHasNewUnread,
    scrollRef, scrollChatToBottom, fetchNewConversation, setSearchResult,
  });

  // Initial data fetch
  useEffect(() => {
    if (isChecking) return;

    if (!isAuthenticated || !token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      try {
        const [profileRes, sidebarRes, requestRes] = await Promise.all([
          getUserProfile(),
          getSidebarUsers(),
          getFriendRequests(),
        ]);
        if (cancelled) return;
        if (profileRes.data.success) setCurrentUser(profileRes.data.user);
        if (sidebarRes.data.success) {
          const list = sidebarRes.data.users || sidebarRes.data.friends || [];
          setUsers(
            list.map((u) => ({ ...u, unreadCount: u.unreadCount || 0 })),
          );
        }
        if (requestRes.data.success)
          setRequestCount(requestRes.data.requests.length);
      } catch (error) {
        console.error("[Home] fetchData error:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const fetchGroups = async () => {
      try {
        const res = await getGroups();
        if (cancelled) return;
        if (res.data.success) setGroups(res.data.groups);
      } catch (error) {
        console.error("[Home] fetchGroups error:", error);
      }
    };

    fetchData();
    fetchGroups();

    return () => {
      cancelled = true;
    };
  }, [isChecking, isAuthenticated, token]);

  // Sync online status vào users list
  useEffect(() => {
    if (!users.length) return;
    setUsers((prev) =>
      prev.map((u) => ({
        ...u,
        isOnline: onlineUsers.some((ou) => String(ou.userId) === String(u._id)),
      })),
    );
  }, [onlineUsers, users.length]);

  // Listen for "open-chat-with" event from MissedCallToast → open conversation
  useEffect(() => {
    const handler = (e) => {
      const { userId } = e.detail || {};
      if (!userId) return;
      const target = users.find((u) => u._id === userId || u.id === userId);
      if (target) {
        setActiveChat(target);
        setShowCallHistoryModal(false);
      }
    };
    window.addEventListener('open-chat-with', handler);
    return () => window.removeEventListener('open-chat-with', handler);
  }, [users]);

  // Join / leave group socket room khi đổi chat
  useEffect(() => {
    if (!socket) return;
    if (activeChatIsGroup && activeChatId) {
      socket.emit(SOCKET_EVENTS.GROUP_JOIN, activeChatId);
    } else if (activeChatRef.current?.members) {
      socket.emit(SOCKET_EVENTS.GROUP_LEAVE, activeChatRef.current._id);
    }
  }, [activeChatId, activeChatIsGroup, socket]);

  // Event handlers
  const handleSelectUser = (user) => {
    const currentChat = activeChatRef.current;
    if (
      currentChat?._id === user?._id &&
      Boolean(currentChat?.members) === Boolean(user?.members)
    )
      return;

    resetChatState();
    armAutoScrollLock();
    setActiveChat(user);

    setUsers((prev) =>
      prev.map((u) => {
        if (u._id !== user._id) return u;
        const lm = u.lastMessage
          ? { ...u.lastMessage, isRead: true }
          : u.lastMessage;
        return { ...u, hasUnread: false, unreadCount: 0, lastMessage: lm };
      }),
    );

    if (user.members) {
      setGroups((prev) =>
        prev.map((g) => {
          if (g._id !== user._id) return g;
          const lm = g.lastMessage
            ? { ...g.lastMessage, isRead: true }
            : g.lastMessage;
          return { ...g, hasUnread: false, unreadCount: 0, lastMessage: lm };
        }),
      );
    }

    if (socket) {
      if (user.members) {
        socket.emit(SOCKET_EVENTS.MESSAGE_MARK_READ, {
          isGroup: true,
          groupId: user._id,
          readerId: currentUser._id,
        });
      } else {
        socket.emit(SOCKET_EVENTS.MESSAGE_MARK_READ, {
          senderId: user._id,
          receiverId: currentUser._id,
          isGroup: false,
        });
      }
    }
  };

  const handleCall = (type = "video") => {
    if (!currentChatUser) return;
    if (currentChatUser.members || currentChatUser.isGroup) {
      toast.warning("Chưa hỗ trợ gọi nhóm!");
      return;
    }
    const chatUserId = currentChatUser._id || currentChatUser.id;
    const sessionId = Date.now();
    const url = `/call/${chatUserId}?name=${encodeURIComponent(currentChatUser.displayName)}&avatar=${encodeURIComponent(currentChatUser.avatar)}&type=${type}&session=${sessionId}`;
    localStorage.setItem("activePartnerUserId", chatUserId);
    localStorage.setItem("tempCallType", type);
    window.open(url, "CallWindow", "width=1200,height=800,noopener,noreferrer");
  };

  const handleCreateGroupSuccess = useCallback(
    (newGroup) => {
      upsertGroup(newGroup);
      setActiveChat(newGroup);
    },
    [upsertGroup],
  );

  const handleLogout = async () => {
    if (socket) socket.disconnect();
    await logout();
    // setCurrentUser(null);   xóa di để ko bị reset avt khi bấm logout
    window.location.href = "/login";
  };

  const handleUpdateSuccess = (updatedUser) => setCurrentUser(updatedUser);

  // Render
  if (isLoading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader />
      </div>
    );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── SIDEBAR ── */}
      <div
        className={`${activeChat ? "hidden sm:flex" : "flex"} w-full sm:w-auto h-full`}
      >
        <Sidebar
          currentUser={currentUser}
          setShowProfile={setShowProfile}
          getAvatarUrl={getAvatarUrl}
          setShowCreateGroup={setShowCreateGroup}
          setShowRequestModal={setShowRequestModal}
          requestCount={requestCount}
          handleLogout={handleLogout}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isSearching={isSearching}
          groups={groups}
          handleSelectUser={handleSelectUser}
          usersToDisplay={usersToDisplay}
          users={users}
          sentRequests={sentRequests}
          checkIsOnline={checkIsOnline}
          renderLastMessage={renderLastMessage}
          handleAddFriend={handleAddFriend}
          setShowCallHistoryModal={setShowCallHistoryModal}
        />
      </div>

      {/* CHAT AREA */}
      <div
        className={`${activeChat ? "flex" : "hidden sm:flex"} flex-1 flex-col bg-gray-50 h-full`}
      >
        {activeChat && currentChatUser ? (
          <FilePicker
            key={activeChatKey || "empty-chat-picker"}
            onFilesSelected={addFiles}
            disableClick={true}
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            <ChatWindow
              key={activeChatKey || "empty-chat-window"}
              activeChat={activeChat}
              setActiveChat={setActiveChat}
              currentChatUser={currentChatUser}
              currentUser={currentUser}
              messages={messages}
              users={users}
              isTyping={isTyping}
              typingUserName={typingUserName}
              typingUserAvatar={typingUserAvatar}
              scrollRef={scrollRef}
              bottomRef={bottomRef}
              getAvatarUrl={getAvatarUrl}
              checkIsOnline={checkIsOnline}
              handleCall={handleCall}
              setShowGroupMembers={setShowGroupMembers}
              handleScrollToBottom={handleScrollToBottom}
              onMediaContentLoad={handleMediaContentLoad}
              onUserMovedAwayFromBottom={handleUserMovedAwayFromBottom}
              handleRetryMessage={handleRetryMessage}
              loadMoreMessages={loadMoreMessages}
              isLoadingMore={isLoadingMore}
              isChatBootstrapping={isChatBootstrapping}
              setHasNewUnread={setHasNewUnread}
              hasNewUnread={hasNewUnread}
            />
            <ChatInput
              showEmoji={showEmoji}
              setShowEmoji={setShowEmoji}
              onEmojiClick={(e) => setNewMessage((prev) => prev + e.emoji)}
              handleSendMessage={handleSendMessage}
              newMessage={newMessage}
              handleInputChange={handleInputChange}
              uploadQueue={uploadQueue}
              addFiles={addFiles}
              removeUploadItem={removeUploadItem}
            />
          </FilePicker>
        ) : (
          <ChatWindow
            key="empty-chat-window"
            activeChat={null}
            setActiveChat={setActiveChat}
            currentChatUser={null}
          />
        )}
      </div>

      {/* MODALS */}
      {showProfile && (
        <UserProfileSidebar
          isOpen={showProfile}
          user={{ ...currentUser, avatar: getAvatarUrl(currentUser?.avatar) }}
          onClose={() => setShowProfile(false)}
          onUpdateSuccess={handleUpdateSuccess}
        />
      )}

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        users={users}
        onCreateSuccess={handleCreateGroupSuccess}
      />

      {showRequestModal && (
        <FriendRequestModal
          onClose={() => setShowRequestModal(false)}
          setRequestCount={setRequestCount}
        />
      )}

      {showGroupMembers && activeChat?.members && currentUser && (
        <GroupMembersModal
          group={activeChat}
          currentUser={currentUser}
          onClose={() => setShowGroupMembers(false)}
          onGroupUpdated={(updatedGroup) => {
            upsertGroup(updatedGroup);
            if (!updatedGroup.members.some((m) => m._id === currentUser._id)) {
              setShowGroupMembers(false);
              setActiveChat(null);
            }
          }}
        />
      )}

      <CallHistoryModal
        isOpen={showCallHistoryModal}
        onClose={() => setShowCallHistoryModal(false)}
        currentUser={currentUser}
      />
    </div>
  );
};

export default Home;
