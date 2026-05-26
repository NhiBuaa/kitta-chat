const ACCESS_TOKEN_KEY = "token";
const STORED_USER_KEY = "user";

let memoryAccessToken = null;
let memoryUser = null;

const getStorage = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
};

export const getAccessToken = () => memoryAccessToken;

export const setAccessToken = (token) => {
  memoryAccessToken = token || null;
  getStorage()?.removeItem(ACCESS_TOKEN_KEY);
};

export const clearAccessToken = () => {
  memoryAccessToken = null;
  getStorage()?.removeItem(ACCESS_TOKEN_KEY);
};

export const getStoredUser = () => memoryUser;

export const setStoredUser = (user) => {
  memoryUser = user || null;
  getStorage()?.removeItem(STORED_USER_KEY);
};

export const clearStoredUser = () => {
  memoryUser = null;
  getStorage()?.removeItem(STORED_USER_KEY);
};

export const clearAuthSession = () => {
  clearAccessToken();
  clearStoredUser();
};

export const resetAuthSessionMemoryForTests = () => {
  memoryAccessToken = null;
  memoryUser = null;
};
