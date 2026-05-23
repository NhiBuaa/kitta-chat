export const getLeaveCallEvent = ({ socket, partnerUserId, callId, callAccepted } = {}) => {
    if (!socket || !partnerUserId || !callId) return null;

    return callAccepted
        ? { event: 'endCall', payload: { to: partnerUserId, callId } }
        : { event: 'rejectCall', payload: { to: partnerUserId, callId, reason: 'cancelled' } };
};
