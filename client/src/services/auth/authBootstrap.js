import {
  clearAuthSession,
  getAccessToken,
  getStoredUser,
  setAccessToken,
  setStoredUser,
} from "./authSession.js";

const defaultTokenStore = {
  getAccessToken,
  setAccessToken,
  getStoredUser,
  setStoredUser,
  clearAuthSession,
};

export const createAuthState = ({ status, source, token = null, user = null }) => ({
  status,
  source,
  token,
  user,
});

export const bootstrapAuth = async ({
  tokenStore = defaultTokenStore,
  refreshSession,
} = {}) => {
  if (refreshSession) {
    try {
      const result = await refreshSession();
      if (result?.success && result.token) {
        tokenStore.setAccessToken(result.token);
        if (result.user) tokenStore.setStoredUser(result.user);
        return createAuthState({
          status: "authenticated",
          source: "refresh-cookie",
          token: result.token,
          user: result.user || tokenStore.getStoredUser?.() || null,
        });
      }
    } catch {
      // Cookie bootstrap is optional during migration; fall back to local token.
    }
  }

  const fallbackToken = tokenStore.getAccessToken?.() || null;
  if (fallbackToken) {
    return createAuthState({
      status: "authenticated",
      source: "local-storage-fallback",
      token: fallbackToken,
      user: tokenStore.getStoredUser?.() || null,
    });
  }

  return createAuthState({
    status: "unauthenticated",
    source: "none",
  });
};

export const logoutAuth = async ({
  tokenStore = defaultTokenStore,
  logoutSession,
} = {}) => {
  try {
    await logoutSession?.();
  } catch {
    // Client logout should still clear local auth state if backend logout fails.
  }

  tokenStore.clearAuthSession();
  return createAuthState({
    status: "unauthenticated",
    source: "logout",
  });
};
