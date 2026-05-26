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
    user: null,
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

  const syncFromClientSession = useCallback(() => {
    const token = getAccessToken();
    const user = getStoredUser();
    setAuthState({
      status: token ? "authenticated" : "unauthenticated",
      source: token ? "client-session-sync" : "client-session-empty",
      token,
      user,
    });
  }, []);

  const updateUser = useCallback((nextUser) => {
    setStoredUser(nextUser);
    setAuthState((current) => ({
      ...current,
      user: nextUser || null,
    }));
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
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
    window.addEventListener(AUTH_CHANGED_EVENT, syncFromClientSession);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncFromClientSession);
    };
  }, [syncFromClientSession]);

  const value = useMemo(
    () => ({
      ...authState,
      isChecking: authState.status === "checking",
      isAuthenticated: authState.status === "authenticated",
      refreshAuth,
      updateUser,
      logout,
    }),
    [authState, logout, refreshAuth, updateUser],
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
