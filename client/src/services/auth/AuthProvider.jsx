import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { logoutSession, refreshSession } from "@/services/api/authApi.js";
import { bootstrapAuth, logoutAuth } from "@/services/auth/authBootstrap.js";
import {
  clearAuthSession,
  getAccessToken,
  getStoredUser,
  setAccessToken,
  setStoredUser,
} from "@/services/auth/authSession.js";

const AUTH_CHANGED_EVENT = "auth-changed";

const AuthContext = createContext(null);

const tokenStore = {
  getAccessToken,
  setAccessToken,
  getStoredUser,
  setStoredUser,
  clearAuthSession,
};

const toAuthState = (state) => ({
  status: state.status,
  source: state.source,
  token: state.token || null,
  user: state.user || null,
});

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => ({
    status: "checking",
    source: "startup",
    token: getAccessToken(),
    user: getStoredUser(),
  }));

  const refreshAuth = useCallback(async () => {
    setAuthState((current) => ({ ...current, status: "checking" }));
    const nextState = await bootstrapAuth({
      tokenStore,
      refreshSession: async () => {
        const response = await refreshSession();
        return response.data;
      },
    });
    setAuthState(toAuthState(nextState));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    return nextState;
  }, []);

  const syncFromClientStorage = useCallback(() => {
    const token = getAccessToken();
    const user = getStoredUser();
    setAuthState({
      status: token ? "authenticated" : "unauthenticated",
      source: token ? "client-storage-sync" : "client-storage-empty",
      token,
      user,
    });
  }, []);

  const logout = useCallback(async () => {
    const nextState = await logoutAuth({
      tokenStore,
      logoutSession: async () => logoutSession(),
    });
    setAuthState(toAuthState(nextState));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    return nextState;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runBootstrap = async () => {
      const nextState = await bootstrapAuth({
        tokenStore,
        refreshSession: async () => {
          const response = await refreshSession();
          return response.data;
        },
      });

      if (!cancelled) {
        setAuthState(toAuthState(nextState));
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      }
    };

    runBootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_CHANGED_EVENT, syncFromClientStorage);
    window.addEventListener("storage", syncFromClientStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncFromClientStorage);
      window.removeEventListener("storage", syncFromClientStorage);
    };
  }, [syncFromClientStorage]);

  const value = useMemo(
    () => ({
      ...authState,
      isChecking: authState.status === "checking",
      isAuthenticated: authState.status === "authenticated",
      refreshAuth,
      logout,
    }),
    [authState, logout, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
