const { getPolicy } = require("./closureMinimumPolicyCatalog");

const RATE_LIMIT_HASH_TAG_PATTERN = /\{([^{}]+)\}/g;

const encodeKeyPart = (value) => Buffer.from(String(value), "utf8").toString("hex");

const assertActor = (actor) => {
  if (!actor || typeof actor.value !== "string" || actor.value.length === 0) {
    throw new Error("Rate-limit actor is required");
  }
  if (!/^[a-z_]+$/.test(String(actor.kind || ""))) {
    throw new Error("Rate-limit actor kind is invalid");
  }
  return actor;
};

const scopeTag = (policy, actor) => {
  const canonicalActor = assertActor(actor);
  const expectedKinds = {
    network: "network",
    subject: "subject",
    user: "user",
    socket_user: "socket_user",
    user_conversation: "user",
  };
  const expectedKind = expectedKinds[policy.scope];
  if (expectedKind && canonicalActor.kind !== expectedKind) {
    throw new Error(`Rate-limit actor kind mismatch for ${policy.id}`);
  }
  const tagKind = policy.scope === "user_conversation" ? "user" : policy.scope;
  return `${tagKind}:${encodeKeyPart(canonicalActor.value)}`;
};

const assertKeyPrefix = (keyPrefix) => {
  if (typeof keyPrefix !== "string" || keyPrefix.length === 0) {
    throw new Error("Rate-limit key prefix is required");
  }
  if (/[{}\s]/.test(keyPrefix)) {
    throw new Error("Rate-limit key prefix cannot contain hash-tag delimiters or whitespace");
  }
  return keyPrefix;
};

const extractHashTag = (key) => {
  const match = String(key).match(RATE_LIMIT_HASH_TAG_PATTERN);
  if (!match || match.length !== 1) {
    throw new Error("Rate-limit key must contain exactly one hash tag");
  }
  return match[0].slice(1, -1);
};

const assertSameHashTag = (keys) => {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("Rate-limit admission requires at least one key");
  }
  const tags = keys.map(extractHashTag);
  if (new Set(tags).size !== 1) {
    throw new Error("Rate-limit admission keys must share one Redis Cluster hash tag");
  }
  return tags[0];
};

const createPolicyKey = (policy, { actor, conversationId, keyPrefix }) => {
  const prefix = assertKeyPrefix(keyPrefix);
  const tag = scopeTag(policy, actor);
  const base = `${prefix}:{${tag}}:${policy.id}`;
  if (policy.scope === "user_conversation") {
    if (typeof conversationId !== "string" || conversationId.length === 0) {
      throw new Error(`Conversation is required for ${policy.id}`);
    }
    return `${base}:conversation:${encodeKeyPart(conversationId)}`;
  }
  return base;
};

const createStageKeys = (policyIds, context, keyPrefix) => {
  if (!Array.isArray(policyIds) || policyIds.length === 0) {
    throw new Error("Rate-limit admission requires approved policy IDs");
  }
  const keys = policyIds.map((policyId) => createPolicyKey(getPolicy(policyId), {
    ...context,
    keyPrefix,
  }));
  assertSameHashTag(keys);
  return keys;
};

const normalizeIdentityPart = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Call ${label} identity is required`);
  }
  if (/[|\u0000-\u001f]/.test(value)) {
    throw new Error(`Call ${label} identity is invalid`);
  }
  return value;
};

const isValidClientCallId = (value) => (
  typeof value === "string"
  && value.length > 0
  && value.length <= 128
  && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
);

const createCallCorrelationKey = ({ keyPrefix, caller, callee, clientCallId }) => {
  const prefix = assertKeyPrefix(keyPrefix);
  const canonicalCaller = normalizeIdentityPart(caller, "caller");
  const canonicalCallee = normalizeIdentityPart(callee, "callee");
  const canonicalCallId = normalizeIdentityPart(clientCallId, "client call");
  return `${prefix}:{socket_user:${encodeKeyPart(canonicalCaller)}}:call_attempt:${encodeKeyPart(canonicalCallee)}:${encodeKeyPart(canonicalCallId)}`;
};

module.exports = {
  assertActor,
  assertSameHashTag,
  createCallCorrelationKey,
  createPolicyKey,
  createStageKeys,
  encodeKeyPart,
  extractHashTag,
  isValidClientCallId,
  normalizeIdentityPart,
  scopeTag,
};
