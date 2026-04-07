export const CALL_STORAGE_MAX_AGE_MS = 2 * 60 * 1000;

export const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
    ],
};