import {
  clearAuthSession,
  getStoredUser,
  setAccessToken,
  setStoredUser,
} from "./authSession.js";

const defaultTokenStore = {
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
      // Cookie bootstrap is optional during migration; unauthenticated state is handled below.
    }
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
