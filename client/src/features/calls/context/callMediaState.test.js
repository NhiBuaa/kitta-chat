import test from "node:test";
import assert from "node:assert/strict";

import {
    getMediaStatusFromStream,
    persistPartnerMediaStatus,
    sendLocalMediaStatusSnapshot,
} from "./callMediaState.js";

const makeStream = ({ audioEnabled = true, videoEnabled = true } = {}) => ({
    getAudioTracks: () => [{ enabled: audioEnabled }],
    getVideoTracks: () => [{ enabled: videoEnabled }],
});

test("media snapshot reflects actual local track enabled values", () => {
    assert.deepEqual(getMediaStatusFromStream(makeStream()), { cam: true, mic: true });
    assert.deepEqual(getMediaStatusFromStream(makeStream({ audioEnabled: false, videoEnabled: false })), {
        cam: false,
        mic: false,
    });
});

test("media snapshot falls back safely when a track is missing", () => {
    const audioOnlyStream = {
        getAudioTracks: () => [{ enabled: false }],
        getVideoTracks: () => [],
    };

    assert.deepEqual(getMediaStatusFromStream(audioOnlyStream, { cam: true, mic: true }), {
        cam: true,
        mic: false,
    });
});

test("caller sends current media snapshot to callee using toggleMedia", () => {
    const emitted = [];
    const socket = {
        emit: (...args) => emitted.push(args),
    };

    const didSend = sendLocalMediaStatusSnapshot({
        socket,
        to: "callee-user-id",
        stream: makeStream({ audioEnabled: false, videoEnabled: false }),
    });

    assert.equal(didSend, true);
    assert.deepEqual(emitted, [
        ["toggleMedia", { to: "callee-user-id", cam: false, mic: false }],
    ]);
});

test("caller media snapshot is skipped without socket, peer, or stream", () => {
    assert.equal(sendLocalMediaStatusSnapshot({ socket: null, to: "callee", stream: makeStream() }), false);
    assert.equal(sendLocalMediaStatusSnapshot({ socket: { emit() {} }, to: "", stream: makeStream() }), false);
    assert.equal(sendLocalMediaStatusSnapshot({ socket: { emit() {} }, to: "callee", stream: null }), false);
});

test("callee updateMediaStatus can persist latest partner state for call-window hydration", () => {
    const storage = new Map();
    const fakeStorage = {
        setItem: (key, value) => storage.set(key, value),
    };

    persistPartnerMediaStatus({ cam: false, mic: false }, fakeStorage);

    assert.equal(storage.get("tempCallerMediaStatus"), JSON.stringify({ cam: false, mic: false }));
});
