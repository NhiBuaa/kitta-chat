export const createClosedUserProfileModalState = () => ({
  isOpen: false,
  user: null,
});

export const openUserProfileModal = (user) => {
  if (!user?._id) return createClosedUserProfileModalState();

  return {
    isOpen: true,
    user,
  };
};

export const closeUserProfileModal = () => createClosedUserProfileModalState();

export const getUserProfileActions = ({ user, isGroupChat = false } = {}) => {
  if (isGroupChat || !user?._id) return [];

  const actions = [
    { id: "audio", label: "Gọi thoại", type: "call" },
    { id: "video", label: "Gọi video", type: "call" },
  ];

  if (user.isFriend === true) {
    actions.push({ id: "unfriend", label: "Hủy kết bạn", type: "danger" });
  }

  return actions;
};
export const getUserProfileStatusText = (user) => {
  const status = typeof user?.status === "string" ? user.status.trim() : "";
  return status;
};
