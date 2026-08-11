class BrowserOriginConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrowserOriginConfigError";
  }
}

const isDevelopmentOrTest = (environment) => environment === "development" || environment === "test";

const parseOrigin = (rawOrigin) => {
  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch (_error) {
    throw new BrowserOriginConfigError("CORS_ALLOWED_ORIGINS contains an invalid origin");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new BrowserOriginConfigError("CORS_ALLOWED_ORIGINS entries must be bare http or https origins");
  }

  return parsed.origin;
};

const parseBrowserOriginPolicy = ({ rawOrigins, environment } = {}) => {
  if (rawOrigins === undefined || rawOrigins === null || String(rawOrigins).trim() === "") {
    if (!isDevelopmentOrTest(environment)) {
      throw new BrowserOriginConfigError("CORS_ALLOWED_ORIGINS is required outside development and test");
    }

    return createBrowserOriginPolicy([]);
  }

  const configuredOrigins = String(rawOrigins)
    .split(",")
    .map((value) => value.trim());

  if (configuredOrigins.some((value) => value.length === 0)) {
    throw new BrowserOriginConfigError("CORS_ALLOWED_ORIGINS must not contain blank entries");
  }

  return createBrowserOriginPolicy([...new Set(configuredOrigins.map(parseOrigin))]);
};

const createBrowserOriginPolicy = (allowedOrigins) => {
  const exactOrigins = new Set(allowedOrigins);

  return {
    allowedOrigins: [...exactOrigins],
    isAllowedBrowserOrigin(origin) {
      return typeof origin === "string" && exactOrigins.has(origin);
    },
    isRequestOriginAllowed(origin) {
      return origin === undefined || exactOrigins.has(origin);
    },
  };
};

module.exports = {
  BrowserOriginConfigError,
  createBrowserOriginPolicy,
  parseBrowserOriginPolicy,
};
