import React from "react";
import { toast } from "react-toastify";
import MissedCallToast from "@/features/calls/components/MissedCallToast.jsx";

export const showMissedCallToast = ({
    callerName,
    callerAvatar,
    callType = "audio",
    timeLabel,
    onOpenChat,
    onRecall,
    toastId,
} = {}) => {
    const toastContent = ({ closeToast }) =>
        React.createElement(MissedCallToast, {
            callerName,
            callerAvatar,
            callType,
            timeLabel,
            onOpenChat,
            onRecall,
            closeToast,
        });

    return toast(toastContent, {
        toastId: toastId || `missed-call-${callerName || "unknown"}-${callType}`,
        position: "bottom-right",
        autoClose: 4500,
        closeButton: false,
        hideProgressBar: true,
        pauseOnHover: true,
        draggable: true,
        className: "!bg-transparent !shadow-none !p-0 !min-h-0",
        bodyClassName: "!p-0",
    });
};