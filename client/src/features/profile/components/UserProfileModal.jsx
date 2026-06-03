import React from "react";
import { FaPhone, FaTimes, FaUserMinus, FaVideo } from "react-icons/fa";
import UserStatus from "@/features/profile/components/UserStatus.jsx";
import { getUserDisplayName } from "@/utils/getUserDisplayName.js";
import { getUserProfileActions } from "@/features/profile/components/userProfileModalState.js";

const UserProfileModal = ({
  isOpen,
  user,
  isGroupChat = false,
  getAvatarUrl,
  checkIsOnline,
  onClose,
  onCall,
  onUnfriend,
}) => {
  if (!isOpen || !user || isGroupChat) return null;

  const actions = getUserProfileActions({ user, isGroupChat });
  const displayName = getUserDisplayName(user);
  const avatarUrl = getAvatarUrl?.(user.avatar) || user.avatar;
  const isOnline = checkIsOnline?.(user);
  const isFriend = Boolean(user.isFriend);

  const handleAction = (actionId) => {
    if (actionId === "audio") {
      onCall?.("audio");
      return;
    }

    if (actionId === "video") {
      onCall?.("video");
      return;
    }

    if (actionId === "unfriend") {
      onUnfriend?.();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[9998] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="relative h-28 bg-gradient-to-r from-[#4CAF50] to-[#66BB6A]">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/90 hover:text-white transition-colors"
            aria-label="Close profile"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-col items-center text-center">
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg bg-gray-200"
            />
            <h2 className="mt-3 text-xl font-bold text-gray-900">{displayName}</h2>
            <div className="mt-1 flex justify-center">
              <UserStatus user={user} isOnline={isOnline} />
            </div>
            <span className="mt-3 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              {isFriend ? "Bạn bè" : "Chưa kết bạn"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {actions
              .filter((action) => action.type === "call")
              .map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleAction(action.id)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  {action.id === "audio" ? <FaPhone /> : <FaVideo />}
                  {action.label}
                </button>
              ))}
          </div>

          {actions.some((action) => action.id === "unfriend") && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => handleAction("unfriend")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                <FaUserMinus />
                {actions.find((action) => action.id === "unfriend")?.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
