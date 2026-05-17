// client/src/components/MissedCallToast.jsx
import React from "react";
import { FaPhone, FaPhoneSlash, FaVideo } from "react-icons/fa";

const getFallbackAvatar = (callerName = "U") =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(callerName)}&background=fee2e2&color=dc2626`;

const MissedCallToast = ({
  callerName = "Người dùng",
  callerAvatar = "",
  callType = "audio",
  timeLabel = "Vừa xong",
  onOpenChat,
  onRecall,
  closeToast,
}) => {
  const isVideoCall = callType === "video";
  const avatarSrc = callerAvatar || getFallbackAvatar(callerName);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-white/95 p-3 shadow-[0_16px_40px_rgba(239,68,68,0.16)] backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <img
            src={avatarSrc}
            alt={callerName}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-red-100"
          />
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
            <FaPhoneSlash size={11} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-500">
            {isVideoCall ? <FaVideo size={10} /> : <FaPhone size={10} />}
            <span>Cuộc gọi nhỡ</span>
          </div>

          <p className="mt-1 break-words text-sm font-semibold leading-5 text-gray-900">
            Bạn vừa lỡ cuộc gọi {isVideoCall ? "video" : "thoại"} từ {callerName}
          </p>

          <p className="mt-1 text-xs text-gray-500">{timeLabel}</p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                onOpenChat?.();
                closeToast?.();
              }}
              className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
            >
              Xem chat
            </button>
            <button
              onClick={() => {
                onRecall?.(callType);
                closeToast?.();
              }}
              className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
            >
              Gọi lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissedCallToast;