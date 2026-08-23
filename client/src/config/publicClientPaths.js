const DEFAULT_PUBLIC_CLIENT_PATHS = Object.freeze({
  socketBase: "/",
  auth: "/api/auth",
  users: "/api/users",
  messages: "/api/messages",
  groups: "/api/groups",
  files: "/api/files",
  calls: "/api/calls",
  runtimeConfig: "/runtime-config.json",
});

const createPublicClientPaths = (env = {}) => ({
  socketBase: env.VITE_API_URL || DEFAULT_PUBLIC_CLIENT_PATHS.socketBase,
  auth: env.VITE_API_URL_AUTH || DEFAULT_PUBLIC_CLIENT_PATHS.auth,
  users: env.VITE_API_URL_USERS || DEFAULT_PUBLIC_CLIENT_PATHS.users,
  messages: env.VITE_API_URL_MESSAGES || DEFAULT_PUBLIC_CLIENT_PATHS.messages,
  groups: env.VITE_API_URL_GROUPS || DEFAULT_PUBLIC_CLIENT_PATHS.groups,
  files: env.VITE_API_URL_FILES || DEFAULT_PUBLIC_CLIENT_PATHS.files,
  calls: env.VITE_API_URL_CALLS || DEFAULT_PUBLIC_CLIENT_PATHS.calls,
  runtimeConfig: DEFAULT_PUBLIC_CLIENT_PATHS.runtimeConfig,
});

const PUBLIC_CLIENT_PATHS = Object.freeze(
  createPublicClientPaths({
    VITE_API_URL: import.meta.env?.VITE_API_URL,
    VITE_API_URL_AUTH: import.meta.env?.VITE_API_URL_AUTH,
    VITE_API_URL_USERS: import.meta.env?.VITE_API_URL_USERS,
    VITE_API_URL_MESSAGES: import.meta.env?.VITE_API_URL_MESSAGES,
    VITE_API_URL_GROUPS: import.meta.env?.VITE_API_URL_GROUPS,
    VITE_API_URL_FILES: import.meta.env?.VITE_API_URL_FILES,
    VITE_API_URL_CALLS: import.meta.env?.VITE_API_URL_CALLS,
  }),
);

export {
  DEFAULT_PUBLIC_CLIENT_PATHS,
  PUBLIC_CLIENT_PATHS,
  createPublicClientPaths,
};
