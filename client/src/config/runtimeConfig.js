const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "target",
  "capabilities",
  "webrtc",
]);

const CAPABILITY_KEYS = Object.freeze([
  "directChat",
  "groupChat",
  "realtimeSidebar",
  "calls",
  "selfSignup",
  "seededDemoAccounts",
  "upload",
  "recovery",
  "googleLogin",
  "metricsExport",
  "issue61Measurement",
]);

const createDisabledCapabilities = () => Object.fromEntries(
  CAPABILITY_KEYS.map((key) => [key, false]),
);

class RuntimeConfigValidationError extends Error {
  constructor(issues) {
    super(`Runtime configuration is invalid: ${issues.join("; ")}`);
    this.name = "RuntimeConfigValidationError";
    this.issues = issues;
  }
}

class RuntimeConfigLoadError extends Error {
  constructor(code) {
    super(`Runtime configuration ${code}`);
    this.name = "RuntimeConfigLoadError";
    this.code = code;
  }
}

const isRecord = (value) => Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value);

const hasExactBooleanKeys = (value, expectedKeys) => isRecord(value)
  && Object.keys(value).length === expectedKeys.length
  && expectedKeys.every(
    (key) => Object.hasOwn(value, key) && typeof value[key] === "boolean",
  );

const satisfiesPublicDemoRuntimePolicy = (capabilities) => (
  capabilities.directChat === true
  && capabilities.groupChat === true
  && capabilities.realtimeSidebar === true
  && capabilities.selfSignup === true
  && capabilities.seededDemoAccounts === true
  && capabilities.recovery === false
  && capabilities.googleLogin === false
  && capabilities.metricsExport === false
  && capabilities.issue61Measurement === false
);

const ICE_URL_PATTERN = /^(stun|stuns|turn|turns):([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/i;

const isSafeIceUrl = (value) => {
  if (typeof value !== "string" || value.trim() !== value) return false;

  const match = ICE_URL_PATTERN.exec(value);
  if (!match) return false;

  const [, scheme, , port, transport] = match;
  if (port && (Number(port) < 1 || Number(port) > 65535)) return false;
  if (transport && !scheme.toLowerCase().startsWith("turn")) return false;
  return true;
};

const hasSafeIceUrls = (value) => isSafeIceUrl(value)
  || (Array.isArray(value) && value.length > 0 && value.every(isSafeIceUrl));

const hasSafeWebRtcMetadata = (value) => isRecord(value)
  && Object.keys(value).length === 1
  && Object.hasOwn(value, "iceServers")
  && Array.isArray(value.iceServers)
  && value.iceServers.every(
    (iceServer) => isRecord(iceServer)
      && Object.keys(iceServer).length === 1
      && Object.hasOwn(iceServer, "urls")
      && hasSafeIceUrls(iceServer.urls),
  );

const validateEnvelope = (document) => {
  if (!isRecord(document)) {
    return ["runtime config must be an object"];
  }

  const issues = [];
  const actualKeys = Object.keys(document);
  if (
    actualKeys.length !== TOP_LEVEL_KEYS.length
    || !TOP_LEVEL_KEYS.every((key) => Object.hasOwn(document, key))
  ) {
    issues.push("runtime config must contain only the required top-level fields");
  }
  if (document.schemaVersion !== 1) {
    issues.push("schemaVersion must be exactly 1");
  }
  if (document.target !== "public-demo") {
    issues.push("target must be exactly public-demo");
  }
  const capabilitiesValid = hasExactBooleanKeys(document.capabilities, CAPABILITY_KEYS);
  if (!capabilitiesValid) {
    issues.push("capabilities must contain only the required boolean keys");
  }
  if (
    capabilitiesValid
    && !satisfiesPublicDemoRuntimePolicy(document.capabilities)
  ) {
    issues.push("capabilities violate the public-demo runtime policy");
  }
  if (!hasSafeWebRtcMetadata(document.webrtc)) {
    issues.push("webrtc must contain only non-secret ICE server URL metadata");
  }

  return issues;
};

const cloneIceServer = ({ urls }) => ({
  urls: Array.isArray(urls) ? [...urls] : urls,
});

const parseRuntimeConfigDocument = (document) => {
  const issues = validateEnvelope(document);
  if (issues.length > 0) throw new RuntimeConfigValidationError(issues);

  return {
    schemaVersion: document.schemaVersion,
    target: document.target,
    capabilities: { ...document.capabilities },
    webrtc: {
      iceServers: document.webrtc.iceServers.map(cloneIceServer),
    },
  };
};

const loadRuntimeConfig = async ({ fetchImpl = globalThis.fetch } = {}) => {
  let response;
  try {
    response = await fetchImpl("/runtime-config.json", {
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new RuntimeConfigLoadError("unavailable");
  }

  if (!response?.ok) {
    throw new RuntimeConfigLoadError("unavailable");
  }

  let document;
  try {
    document = await response.json();
  } catch {
    throw new RuntimeConfigLoadError("invalid-response");
  }

  try {
    return parseRuntimeConfigDocument(document);
  } catch {
    throw new RuntimeConfigLoadError("invalid-document");
  }
};

const createLegacyLocalRuntimeConfig = () => ({
  schemaVersion: 1,
  target: "legacy-local",
  capabilities: {
    directChat: true,
    groupChat: true,
    realtimeSidebar: true,
    calls: true,
    selfSignup: true,
    seededDemoAccounts: false,
    upload: true,
    recovery: true,
    googleLogin: true,
    metricsExport: false,
    issue61Measurement: false,
  },
  webrtc: { iceServers: [] },
});

const createRuntimeConfigLoaderForTarget = ({
  target,
  publicDemoLoad = loadRuntimeConfig,
} = {}) => {
  if (target === undefined || target === null || target === "") {
    return async () => createLegacyLocalRuntimeConfig();
  }
  if (target === "public-demo") return publicDemoLoad;

  return async () => {
    throw new RuntimeConfigLoadError("invalid-target");
  };
};

export {
  RuntimeConfigLoadError,
  RuntimeConfigValidationError,
  createRuntimeConfigLoaderForTarget,
  createDisabledCapabilities,
  loadRuntimeConfig,
  parseRuntimeConfigDocument,
};
