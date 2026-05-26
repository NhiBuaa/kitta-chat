export const getMediaStatusFromStream = (stream, fallback = { cam: true, mic: true }) => {
    const audioTracks = stream?.getAudioTracks?.() ?? [];
    const videoTracks = stream?.getVideoTracks?.() ?? [];

    return {
        cam: videoTracks.length > 0
            ? videoTracks.some((track) => Boolean(track.enabled))
            : Boolean(fallback.cam),
        mic: audioTracks.length > 0
            ? audioTracks.some((track) => Boolean(track.enabled))
            : Boolean(fallback.mic),
    };
};

export const setAudioEnabled = (stream, enabled) => {
    const audioTracks = stream?.getAudioTracks?.() ?? [];
    if (audioTracks.length === 0) return false;

    audioTracks.forEach((track) => {
        track.enabled = Boolean(enabled);
    });
    return true;
};

export const setVideoEnabled = (stream, enabled) => {
    const videoTracks = stream?.getVideoTracks?.() ?? [];
    if (videoTracks.length === 0) return false;

    videoTracks.forEach((track) => {
        track.enabled = Boolean(enabled);
    });
    return true;
};

export const sendLocalMediaStatusSnapshot = ({ socket, to, stream, fallback }) => {
    if (!socket || !to || !stream) return false;

    const mediaStatus = getMediaStatusFromStream(stream, fallback);
    socket.emit("toggleMedia", { to, cam: mediaStatus.cam, mic: mediaStatus.mic });
    return true;
};

export const persistPartnerMediaStatus = (mediaStatus, storage = globalThis.localStorage) => {
    if (!storage || typeof storage.setItem !== "function") return false;
    if (typeof mediaStatus?.cam !== "boolean" || typeof mediaStatus?.mic !== "boolean") return false;

    storage.setItem("tempCallerMediaStatus", JSON.stringify({
        cam: mediaStatus.cam,
        mic: mediaStatus.mic,
    }));
    return true;
};
