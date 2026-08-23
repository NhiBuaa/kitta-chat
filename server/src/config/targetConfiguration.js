const TARGET_CONFIGURATION_KEYS = Object.freeze([
  "targetName",
  "publicAppUrl",
  "allowedBrowserOrigins",
  "backendUpstream",
  "capabilities",
  "workerDependencyBindings",
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

const WORKER_DEPENDENCY_BINDINGS = Object.freeze({
  imageWorker: Object.freeze(["mongo", "redis", "rabbitmq", "objectStorage"]),
  auditWorker: Object.freeze(["rabbitmq"]),
  notificationWorker: Object.freeze([]),
});

const isExactBooleanRecord = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length
    && keys.every((key) => Object.hasOwn(value, key) && typeof value[key] === "boolean");
};

const satisfiesPublicDemoCapabilityPolicy = (capabilities) => (
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

const isLoopbackHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "::1"
    || normalized.startsWith("::ffff:127.")
    || normalized.startsWith("127.");
};

const hasExactUniqueMembers = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length
  && new Set(actual).size === actual.length
  && expected.every((value) => actual.includes(value));

const isWorkerDependencyBindingsValid = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const expectedRecipients = Object.keys(WORKER_DEPENDENCY_BINDINGS);
  const actualRecipients = Object.keys(value);
  return actualRecipients.length === expectedRecipients.length
    && expectedRecipients.every(
      (recipient) => Object.hasOwn(value, recipient)
        && hasExactUniqueMembers(value[recipient], WORKER_DEPENDENCY_BINDINGS[recipient]),
    );
};

const cloneBindings = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([recipient, dependencies]) => [
      recipient,
      Array.isArray(dependencies) ? [...dependencies] : dependencies,
    ]),
  );
};

const isBareHttpsOrigin = (value) => {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  return parsed.protocol === "https:"
    && parsed.username === ""
    && parsed.password === ""
    && parsed.pathname === "/"
    && parsed.search === ""
    && parsed.hash === ""
    && parsed.port === ""
    && !isLoopbackHostname(parsed.hostname)
    && !parsed.hostname.includes("*")
    && parsed.origin === value;
};

const isPrivateBackendOrigin = (
  value,
  publicAppUrl,
  authority = {},
) => {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    return false;
  }

  let parsed;
  let publicHostname;
  try {
    parsed = new URL(value);
    publicHostname = new URL(publicAppUrl).hostname;
  } catch {
    return false;
  }

  const allowSyntheticTestValues = Object.hasOwn(
    authority,
    "allowSyntheticTestValues",
  ) && authority.allowSyntheticTestValues === true;
  const privateHostname = parsed.hostname.endsWith(".railway.internal")
    || (
      allowSyntheticTestValues
      && parsed.hostname.endsWith(".internal.test")
    );

  return ["http:", "https:"].includes(parsed.protocol)
    && parsed.username === ""
    && parsed.password === ""
    && parsed.pathname === "/"
    && parsed.search === ""
    && parsed.hash === ""
    && parsed.port === "3000"
    && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    && !parsed.hostname.includes("*")
    && privateHostname
    && parsed.hostname !== publicHostname
    && parsed.origin === value
    && parsed.origin !== publicAppUrl;
};

const validateTargetConfiguration = (input, authority = {}) => {
  const issues = [];
  const inputIsObject = Boolean(input)
    && typeof input === "object"
    && !Array.isArray(input);
  const source = inputIsObject ? input : {};
  const trustedBindingValid = isBareHttpsOrigin(authority.expectedPublicAppUrl)
    && isPrivateBackendOrigin(
      authority.expectedBackendUpstream,
      authority.expectedPublicAppUrl,
      authority,
    );
  const allowedBrowserOriginsValid = Array.isArray(source.allowedBrowserOrigins)
    && source.allowedBrowserOrigins.length === 1
    && source.allowedBrowserOrigins[0] === source.publicAppUrl
    && isBareHttpsOrigin(source.allowedBrowserOrigins[0]);

  if (!inputIsObject) {
    issues.push("target configuration must be an object");
  }

  if (
    !inputIsObject
    || Object.keys(source).length !== TARGET_CONFIGURATION_KEYS.length
    || !TARGET_CONFIGURATION_KEYS.every((key) => Object.hasOwn(source, key))
  ) {
    issues.push("target configuration must contain only the required fields");
  }

  if (source.targetName !== "public-demo") {
    issues.push("targetName must be exactly public-demo");
  }

  if (!trustedBindingValid) {
    issues.push("trusted target binding must provide exact public and backend origins");
  }

  if (
    !isBareHttpsOrigin(source.publicAppUrl)
    || !allowedBrowserOriginsValid
  ) {
    issues.push("publicAppUrl must be the exact bare HTTPS origin in allowedBrowserOrigins");
  }

  if (source.publicAppUrl !== authority.expectedPublicAppUrl) {
    issues.push("publicAppUrl must match the trusted target binding");
  }

  if (!allowedBrowserOriginsValid) {
    issues.push("allowedBrowserOrigins must contain publicAppUrl exactly once");
  }

  if (!isPrivateBackendOrigin(source.backendUpstream, source.publicAppUrl, authority)) {
    issues.push("backendUpstream must be a private bare HTTP(S) origin on port 3000");
  }

  if (
    source.backendUpstream !== authority.expectedBackendUpstream
    || !isPrivateBackendOrigin(source.backendUpstream, source.publicAppUrl, authority)
  ) {
    issues.push("backendUpstream must be the trusted private Railway origin on port 3000");
  }

  const capabilitiesValid = isExactBooleanRecord(source.capabilities, CAPABILITY_KEYS);
  if (!capabilitiesValid) {
    issues.push("capabilities must contain only the required boolean keys");
  }
  if (capabilitiesValid && !satisfiesPublicDemoCapabilityPolicy(source.capabilities)) {
    issues.push("capabilities violate the public-demo fixed capability policy");
  }

  const workerBindingsValid = isWorkerDependencyBindingsValid(
    source.workerDependencyBindings,
  );
  if (!workerBindingsValid) {
    issues.push("workerDependencyBindings must match the approved service dependency matrix");
  }

  return {
    targetName: source.targetName,
    publicAppUrl: source.publicAppUrl,
    allowedBrowserOrigins: Array.isArray(source.allowedBrowserOrigins)
      ? [...source.allowedBrowserOrigins]
      : source.allowedBrowserOrigins,
    backendUpstream: source.backendUpstream,
    capabilities: source.capabilities && typeof source.capabilities === "object"
      ? { ...source.capabilities }
      : source.capabilities,
    workerDependencyBindings: workerBindingsValid
      ? cloneBindings(WORKER_DEPENDENCY_BINDINGS)
      : cloneBindings(source.workerDependencyBindings),
    validationResult: { valid: issues.length === 0, issues },
  };
};

module.exports = { validateTargetConfiguration };
