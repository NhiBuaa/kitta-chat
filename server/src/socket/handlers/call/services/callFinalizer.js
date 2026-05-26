const CallHistory = require("../../../../models/CallHistory");
const { createCallLogMessage } = require("../callLog");

const ACTIVE_FINALIZABLE_STATUSES = ["pending"];
const POPULATE = [
    { path: "callerId", select: "_id displayName avatar username" },
    { path: "receiverId", select: "_id displayName avatar username" },
];

const finalizeCallOnce = async ({
    callId,
    status,
    endedBy = null,
    endedAt = new Date(),
    duration = null,
    requireUnanswered = false,
    activeStatuses = ACTIVE_FINALIZABLE_STATUSES,
} = {}) => {
    if (!callId || !status) {
        return {
            finalized: false,
            alreadyFinalized: false,
            call: null,
            callLogMessage: null,
        };
    }

    const filter = {
        _id: callId,
        endedAt: null,
        status: { $in: activeStatuses },
    };

    if (requireUnanswered) {
        filter.answeredAt = null;
    }

    const update = {
        $set: {
            status,
            endedAt,
            duration,
        },
    };

    if (endedBy) {
        update.$set.endedBy = endedBy;
    }

    const updated = await CallHistory.findOneAndUpdate(
        filter,
        update,
        { returnDocument: "after" },
    ).populate(POPULATE);

    if (!updated) {
        const existing = await CallHistory.findById(callId).populate(POPULATE);
        return {
            finalized: false,
            alreadyFinalized: Boolean(existing?.endedAt),
            call: existing,
            callLogMessage: null,
        };
    }

    const callLogMessage = await createCallLogMessage(updated);
    return {
        finalized: true,
        alreadyFinalized: false,
        call: updated,
        callLogMessage,
    };
};

module.exports = {
    ACTIVE_FINALIZABLE_STATUSES,
    finalizeCallOnce,
};
