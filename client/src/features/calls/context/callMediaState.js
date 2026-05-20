export const getMediaStatusFromStream = (stream, fallback = { cam: true, mic: true }) => {
    const audioTrack = stream?.getAudioTracks?.()[0];
    const videoTrack = stream?.getVideoTracks?.()[0];

    return {
        cam: videoTrack ? Boolean(videoTrack.enabled) : Boolean(fallback.cam),
        mic: audioTrack ? Boolean(audioTrack.enabled) : Boolean(fallback.mic),
    };
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
