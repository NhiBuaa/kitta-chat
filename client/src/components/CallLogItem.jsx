import React from "react";
import { FaPhone, FaPhoneAlt, FaPhoneVolume, FaVideo } from "react-icons/fa";
import { formatDuration, formatCallTime } from "../utils/formatTime";

const CallLogItem = React.memo(({ log, currentUser, chatPartner, onRecall }) => {
  const { callData = {}, sender, receiver, createdAt, createAt } = log;
  const senderId = typeof sender === "object" ? sender?._id || sender?.id : sender;
  const currentUserId = currentUser?._id || currentUser?.id;
  const isCaller = senderId === currentUserId;
  const isVideo = callData.type === "video";
  const partner = isCaller
    ? (typeof receiver === "object" && receiver ? receiver : chatPartner)
    : (typeof sender === "object" && sender ? sender : chatPartner);
  const partnerName =
    partner?.displayName ||
    partner?.name ||
    chatPartner?.displayName ||
    chatPartner?.name ||
    "người dùng";
  const startTime = formatCallTime(createdAt || createAt || callData.startedAt);

  let textTitle = "";
  let textSubtitle = "";
  let icon = null;
  let bubbleColor = "";
  let iconBgColor = "";
  let isMissedAlert = false;

  switch (callData.status) {
    case "completed":
      textTitle = isCaller
        ? `Bạn đã gọi ${partnerName}`
        : `${partnerName} đã gọi bạn`;
      textSubtitle = formatDuration(callData.duration);
      icon = isVideo ? <FaVideo /> : <FaPhone />;
      bubbleColor = isCaller ? "bg-green-50" : "bg-gray-100";
      iconBgColor = isCaller ? "bg-green-500" : "bg-gray-500";
      break;

    case "missed":
    case "unreachable":
      if (isCaller) {
        textTitle = isVideo
          ? `Cuộc gọi video đến ${partnerName} không thành công`
          : `Cuộc gọi thoại đến ${partnerName} không thành công`;
        textSubtitle = startTime;
        icon = isVideo ? <FaVideo /> : <FaPhone />;
        bubbleColor = "bg-gray-100";
        iconBgColor = "bg-gray-400";
      } else {
        textTitle = isVideo
          ? `Bạn đã bỏ lỡ cuộc gọi video từ ${partnerName}`
          : `Bạn đã bỏ lỡ cuộc gọi thoại từ ${partnerName}`;
        textSubtitle = startTime;
        icon = isVideo ? <FaVideo /> : <FaPhone />;
        bubbleColor = "bg-red-50 border border-red-100";
        iconBgColor = "bg-red-500";
        isMissedAlert = true;
      }
      break;

    case "rejected":
    case "busy":
      if (isCaller) {
        textTitle = isVideo
          ? `Cuộc gọi video đến ${partnerName} đã bị từ chối`
          : `Cuộc gọi thoại đến ${partnerName} đã bị từ chối`;
      } else {
        textTitle = isVideo
          ? `Bạn đã từ chối cuộc gọi video từ ${partnerName}`
          : `Bạn đã từ chối cuộc gọi thoại từ ${partnerName}`;
      }
      textSubtitle = startTime;
      icon = isVideo ? <FaVideo /> : <FaPhone />;
      bubbleColor = "bg-gray-100";
      iconBgColor = "bg-gray-400";
      break;

    default:
      textTitle = "Cuộc gọi không xác định";
      textSubtitle = startTime;
      icon = <FaPhoneAlt />;
      bubbleColor = "bg-gray-100";
      iconBgColor = "bg-gray-400";
  }

  return (
    <div className={`flex w-full my-3 ${isCaller ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex items-center gap-3 p-3 rounded-2xl max-w-[280px] sm:max-w-[320px] shadow-sm ${bubbleColor}`}
      >
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-full text-white shrink-0 ${iconBgColor}`}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold break-words whitespace-normal ${isMissedAlert ? "text-red-600" : "text-gray-800"}`}
          >
            {textTitle}
          </p>
          <p className="text-xs text-gray-500 break-words whitespace-normal mt-0.5">
            {textSubtitle}
          </p>
        </div>

        <button
          onClick={() => onRecall?.(partner, callData.type)}
          className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all duration-200 ${
            isMissedAlert
              ? "bg-red-100 text-red-600 hover:bg-red-500 hover:text-white"
              : "bg-white text-blue-500 hover:bg-blue-500 hover:text-white shadow-sm border border-gray-200"
          }`}
          title="Gọi lại"
        >
          <FaPhoneVolume size={14} />
        </button>
      </div>
    </div>
  );
});

export default CallLogItem;
