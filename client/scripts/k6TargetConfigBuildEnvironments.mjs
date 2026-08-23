const FORBIDDEN_VITE_SENTINEL = "K6_FORBIDDEN_VITE_SENTINEL_111";

const PUBLIC_DEMO_BUILD_VALUES = Object.freeze({
  VITE_TARGET: "public-demo",
  VITE_API_URL: "/",
  VITE_API_URL_AUTH: "/api/auth",
  VITE_API_URL_USERS: "/api/users",
  VITE_API_URL_MESSAGES: "/api/messages",
  VITE_API_URL_GROUPS: "/api/groups",
  VITE_API_URL_FILES: "/api/files",
  VITE_API_URL_CALLS: "/api/calls",
});

const withoutViteValues = (environment) => Object.fromEntries(
  Object.entries(environment).filter(([key]) => !key.startsWith("VITE_")),
);

const createK6TargetConfigBuildEnvironments = (environment = process.env) => {
  const base = withoutViteValues(environment);
  const validPublicDemo = {
    ...base,
    ...PUBLIC_DEMO_BUILD_VALUES,
  };
  const legacy = {
    ...validPublicDemo,
    VITE_PROVIDER_TOKEN: FORBIDDEN_VITE_SENTINEL,
  };
  delete legacy.VITE_TARGET;

  return {
    legacy,
    rejectedPublicDemo: {
      ...validPublicDemo,
      VITE_DEFAULT_AVATAR:
        `https://generated.up.railway.app/avatar/${FORBIDDEN_VITE_SENTINEL}`,
    },
    validPublicDemo,
  };
};

export {
  createK6TargetConfigBuildEnvironments,
  FORBIDDEN_VITE_SENTINEL,
};
