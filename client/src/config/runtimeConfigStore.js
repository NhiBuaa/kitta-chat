import { createDisabledCapabilities } from "./runtimeConfig.js";

const SAFE_ERROR_CODES = new Set([
  "unavailable",
  "invalid-response",
  "invalid-document",
  "invalid-target",
]);

const loadingState = () => ({
  status: "loading",
  capabilities: createDisabledCapabilities(),
  webrtc: { iceServers: [] },
  errorCode: null,
});

const createRuntimeConfigStore = ({ load }) => {
  let state = loadingState();
  let requestRevision = 0;
  const listeners = new Set();

  const setState = (nextState) => {
    state = nextState;
    for (const listener of listeners) listener();
  };

  const reload = async () => {
    const requestId = ++requestRevision;
    setState(loadingState());
    try {
      const config = await load();
      if (requestId !== requestRevision) return state;
      setState({
        status: "ready",
        capabilities: { ...config.capabilities },
        webrtc: {
          iceServers: config.webrtc.iceServers.map(({ urls }) => ({
            urls: Array.isArray(urls) ? [...urls] : urls,
          })),
        },
        errorCode: null,
      });
    } catch (error) {
      if (requestId !== requestRevision) return state;
      setState({
        status: "error",
        capabilities: createDisabledCapabilities(),
        webrtc: { iceServers: [] },
        errorCode: SAFE_ERROR_CODES.has(error?.code) ? error.code : "unavailable",
      });
    }
    return state;
  };

  return {
    cancelPending() {
      requestRevision += 1;
    },
    getSnapshot: () => state,
    reload,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export { createRuntimeConfigStore };
