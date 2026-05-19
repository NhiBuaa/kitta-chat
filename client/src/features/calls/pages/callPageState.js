export const canStartOutgoingCall = ({ socket, partnerId, stream, mediaError }) => (
    Boolean(socket && partnerId && stream && !mediaError)
);
