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

export const getAccessToken = () => memoryAccessToken || getStorage()?.getItem(ACCESS_TOKEN_KEY) || null;

export const setAccessToken = (token) => {
  memoryAccessToken = token || null;

  const storage = getStorage();
  if (!storage) return;

  if (token) {
    storage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    storage.removeItem(ACCESS_TOKEN_KEY);
  }
};

export const clearAccessToken = () => {
  memoryAccessToken = null;
  getStorage()?.removeItem(ACCESS_TOKEN_KEY);
};

const parseStoredUser = (userString) => {
  if (!userString) return null;

  try {
    return JSON.parse(userString);
  } catch {
    return null;
  }
};

export const getStoredUser = () => memoryUser || parseStoredUser(getStorage()?.getItem(STORED_USER_KEY));

export const setStoredUser = (user) => {
  memoryUser = user || null;

  const storage = getStorage();
  if (!storage) return;

  if (user) {
    storage.setItem(STORED_USER_KEY, JSON.stringify(user));
  } else {
    storage.removeItem(STORED_USER_KEY);
  }
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
