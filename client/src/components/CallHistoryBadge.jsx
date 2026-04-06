import { useCallHistory } from "../context/CallHistoryContext";

const CallHistoryBadge = () => {
    const { missedCount } = useCallHistory();

    if (missedCount === 0) return null;

    return (
        <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-600 text-[10px] flex items-center justify-center rounded-full border border-blue-600 text-white font-bold">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-red-600 border-2 border-blue-600 text-white text-[10px] font-bold items-center justify-center">
                {missedCount > 9 ? "9+" : missedCount}
            </span>
        </span>
    );
}

export default CallHistoryBadge;