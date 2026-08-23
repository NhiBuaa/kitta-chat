import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { createRuntimeConfigLoaderForTarget } from "./runtimeConfig.js";
import { createRuntimeConfigStore } from "./runtimeConfigStore.js";

const RuntimeConfigContext = createContext(null);

const RuntimeConfigProvider = ({ children, load, target }) => {
  const [store] = useState(() => createRuntimeConfigStore({
    load: load ?? createRuntimeConfigLoaderForTarget({ target }),
  }));
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    store.reload();
    return () => store.cancelPending();
  }, [store]);

  const value = useMemo(() => ({
    ...snapshot,
    reload: store.reload,
  }), [snapshot, store]);

  return createElement(RuntimeConfigContext.Provider, { value }, children);
};

const useRuntimeConfig = () => {
  const context = useContext(RuntimeConfigContext);
  if (!context) {
    throw new Error("useRuntimeConfig must be used within RuntimeConfigProvider");
  }
  return context;
};

export {
  RuntimeConfigContext,
  RuntimeConfigProvider,
  useRuntimeConfig,
};
