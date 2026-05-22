const ACCESS_TOKEN_KEY = "token";
const STORED_USER_KEY = "user";

const getStorage = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
};

export const getAccessToken = () => getStorage()?.getItem(ACCESS_TOKEN_KEY) || null;

export const setAccessToken = (token) => {
  const storage = getStorage();
  if (!storage) return;

  if (token) {
    storage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    storage.removeItem(ACCESS_TOKEN_KEY);
  }
};

export const clearAccessToken = () => {
  getStorage()?.removeItem(ACCESS_TOKEN_KEY);
};

export const getStoredUser = () => {
  const userString = getStorage()?.getItem(STORED_USER_KEY);
  if (!userString) return null;

  try {
    return JSON.parse(userString);
  } catch (error) {
    console.error("[authSession] Failed to parse stored user:", error);
    return null;
  }
};

export const setStoredUser = (user) => {
  const storage = getStorage();
  if (!storage) return;

  if (user) {
    storage.setItem(STORED_USER_KEY, JSON.stringify(user));
  } else {
    storage.removeItem(STORED_USER_KEY);
  }
};

export const clearStoredUser = () => {
  getStorage()?.removeItem(STORED_USER_KEY);
};

export const clearAuthSession = () => {
  clearAccessToken();
  clearStoredUser();
};
