import React, { useState, useEffect, useCallback, useRef } from "react";
import { FaPhone, FaVideo, FaArrowLeft, FaPhoneVolume, FaSearch } from "react-icons/fa";
import { getCallHistory, markAllCallsRead } from "../services/callService";
import { formatDuration, formatCallTime } from "../utils/formatTime";
import { useCallHistory } from "../context/CallHistoryContext";

const TABS = [
  { key: "all", label: "Tất cả" },
  { key: "missed", label: "Nhỡ" },
  { key: "outgoing", label: "Đã gọi" },
  { key: "incoming", label: "Đã nhận" },
];

const getStatusLabel = (status) => {
  const map = {
    completed: "Hoàn thành",
    missed: "Nhỡ",
    rejected: "Từ chối",
    unreachable: "Không thể kết nối",
    busy: "Đang bận",
  };
  return map[status] || status;
};

const getStatusColor = (status) => {
  const map = {
    completed: "bg-green-100 text-green-700",
    missed: "bg-red-100 text-red-700",
    rejected: "bg-orange-100 text-orange-700",
    unreachable: "bg-gray-100 text-gray-600",
    busy: "bg-orange-100 text-orange-700",
  };
  return map[status] || "bg-gray-100 text-gray-600";
};

// Item nhỏ gọn cho sidebar modal
const CallHistoryItem = ({ call, currentUserId, onRecall }) => {
  const { callerId, receiverId, type, status, startedAt, duration } = call;

  // Xác định direction
  const callerIdStr = typeof callerId === "object" ? callerId?._id : callerId;
  const isOutgoing = callerIdStr === currentUserId;

  // Partner info
  const partnerObj = isOutgoing ? receiverId : callerId;
  const partner = typeof partnerObj === "object" ? partnerObj : null;
  const partnerName = partner?.displayName || partner?.name || "Người dùng";
  const partnerAvatar = partner?.avatar || "";
  const isVideo = type === "video";

  // Call time display
  const callTime = formatCallTime(startedAt);

  // Duration display
  let durationLabel = "";
  if (status === "completed" && duration > 0) {
    durationLabel = formatDuration(duration);
  }

  const getFallbackAvatar = (name) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors rounded-xl border border-gray-100">
      {/* Avatar */}
      <div className="relative shrink-0">
        <img
          src={partnerAvatar || getFallbackAvatar(partnerName)}
          alt={partnerName}
          className="w-11 h-11 rounded-full object-cover"
          onError={(e) => { e.target.src = getFallbackAvatar(partnerName); }}
        />
        <div
          className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] ${status === "completed"
              ? "bg-green-500"
              : status === "missed"
                ? "bg-red-500"
                : "bg-gray-400"
            }`}
        >
          {isVideo ? <FaVideo size={8} /> : <FaPhone size={8} />}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold truncate ${status === "missed" && !isOutgoing ? "text-red-600" : "text-gray-800"}`}>
            {isOutgoing ? partnerName : partnerName}
          </p>
          <span className="text-xs text-gray-400 shrink-0 ml-2">{callTime}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusColor(status)}`}>
            {getStatusLabel(status)}
          </span>
          {durationLabel && (
            <span className="text-xs text-gray-500">{durationLabel}</span>
          )}
        </div>
      </div>

      {/* Recall button */}
      {(status === "missed" || status === "rejected" || status === "unreachable" || status === "busy") && (
        <button
          onClick={() => onRecall(partner, isVideo ? "video" : "audio")}
          className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${status === "missed"
              ? "bg-red-100 text-red-600 hover:bg-red-500 hover:text-white"
              : "bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white"
            }`}
          title="Gọi lại"
        >
          <FaPhoneVolume size={14} />
        </button>
      )}
    </div>
  );
};

// Modal lịch sử cuộc gọi (render trong Home)
const CallHistoryModal = ({ isOpen, onClose, currentUser }) => {
  const { clearMissedCount } = useCallHistory();
  const [activeTab, setActiveTab] = useState("all");
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const cursorRef = useRef(null);
  const sentinelRef = useRef(null);

  const currentUserId = currentUser?._id || currentUser?.id;

  const fetchCalls = useCallback(
    async (reset = false) => {
      if (isLoading || (!reset && !hasMore)) return;
      setIsLoading(true);
      try {
        const cursor = reset ? undefined : cursorRef.current;
        const response = await getCallHistory(cursor);
        if (response.data.success) {
          const newCalls = response.data.data.calls || [];
          setCalls((prev) => (reset ? newCalls : [...prev, ...newCalls]));
          const lastCall = newCalls[newCalls.length - 1];
          if (lastCall) cursorRef.current = lastCall._id;
          setHasMore(response.data.data.pagination?.hasMore ?? false);
        }
      } catch (error) {
        console.error("Failed to fetch call history:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasMore]
  );

  // Initial load — fetch + clear badge
  useEffect(() => {
    if (isOpen) {
      clearMissedCount();
      fetchCalls(true);
      markAllCallsRead().catch(() => { });
    }
  }, [isOpen]);

  // Infinite scroll
  useEffect(() => {
    if (!isOpen) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchCalls(false);
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, fetchCalls]);

  if (!isOpen) return null;

  // Filter calls
  const filteredCalls = calls.filter((call) => {
    const callerIdStr =
      typeof call.callerId === "object" ? call.callerId?._id : call.callerId;
    const isOutgoing = callerIdStr === currentUserId;
    const partnerObj = isOutgoing ? call.receiverId : call.callerId;
    const partner =
      typeof partnerObj === "object" ? partnerObj : null;
    const partnerName =
      partner?.displayName || partner?.name || "";
    const matchTab =
      activeTab === "all" ||
      (activeTab === "missed" && ["missed", "rejected", "unreachable", "busy"].includes(call.status)) ||
      (activeTab === "outgoing" && isOutgoing) ||
      (activeTab === "incoming" && !isOutgoing);
    const matchSearch =
      !searchTerm ||
      partnerName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchTab && matchSearch;
  });

  const handleRecall = (partner, callType) => {
    if (!partner) return;
    const chatUserId = partner._id || partner.id;
    const partnerName = partner.displayName || partner.name || "Người dùng";
    const partnerAvatar = partner.avatar || "";
    const sessionId = Date.now();
    const url = `/call/${chatUserId}?name=${encodeURIComponent(partnerName)}&avatar=${encodeURIComponent(partnerAvatar)}&type=${callType}&session=${sessionId}`;
    localStorage.setItem("activePartnerUserId", chatUserId);
    localStorage.setItem("tempCallType", callType);
    window.open(url, "_blank");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-white z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 bg-blue-600 text-white border-b border-blue-700">
          <button onClick={onClose} className="hover:text-blue-200 transition-colors">
            <FaArrowLeft size={18} />
          </button>
          <h2 className="text-lg font-bold">Lịch sử cuộc gọi</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.key
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="relative">
            <FaSearch className="absolute top-3 left-3 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Call list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredCalls.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <FaPhone size={32} className="mb-3 opacity-40" />
              <p className="text-sm">Không có cuộc gọi nào</p>
            </div>
          )}

          {filteredCalls.map((call) => (
            <CallHistoryItem
              key={call._id}
              call={call}
              currentUserId={currentUserId}
              onRecall={handleRecall}
            />
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {isLoading && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!hasMore && calls.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-2">Đã hiển thị tất cả</p>
          )}
        </div>
      </div>
    </>
  );
};

export default CallHistoryModal;
