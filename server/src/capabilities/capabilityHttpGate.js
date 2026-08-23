const { sendError } = require("../utils/apiResponse");

const LEGACY_CAPABILITIES = Object.freeze({
  calls: true,
  googleLogin: true,
  issue61Measurement: false,
  recovery: true,
  syntheticSignupOnly: false,
  upload: true,
});

const DISABLED_HTTP_MATCHERS = Object.freeze([
  Object.freeze({ capability: "recovery", method: "POST", path: /^\/api\/auth\/forgot-password$/ }),
  Object.freeze({ capability: "recovery", method: "POST", path: /^\/api\/auth\/reset-password\/[^/]+$/ }),
  Object.freeze({ capability: "googleLogin", method: "POST", path: /^\/api\/auth\/google$/ }),
  Object.freeze({ capability: "upload", method: "POST", path: /^\/api\/files\/(?:init|get-presigned-url|complete|upload-single)$/ }),
  Object.freeze({ capability: "calls", method: "GET", path: /^\/api\/calls(?:\/|$)/ }),
  Object.freeze({ capability: "calls", method: "POST", path: /^\/api\/calls(?:\/|$)/ }),
]);

const normalizeCapabilities = (capabilities) => ({
  ...LEGACY_CAPABILITIES,
  ...(capabilities && typeof capabilities === "object" ? capabilities : {}),
});

const createCapabilityHttpGate = ({ capabilities } = {}) => {
  const contract = Object.freeze(normalizeCapabilities(capabilities));

  return (req, res, next) => {
    const disabled = DISABLED_HTTP_MATCHERS.some(
      (entry) => entry.method === req.method
        && entry.path.test(req.path)
        && contract[entry.capability] !== true,
    );
    if (!disabled) return next();

    return sendError(res, {
      status: 404,
      code: "CAPABILITY_DISABLED",
      message: "Feature unavailable",
    });
  };
};

module.exports = {
  DISABLED_HTTP_MATCHERS,
  LEGACY_CAPABILITIES,
  createCapabilityHttpGate,
  normalizeCapabilities,
};
