const crypto = require("node:crypto");
const { createClient, createCluster } = require("redis");
const { getPolicy, POLICIES } = require("./closureMinimumPolicyCatalog");
const {
  assertSameHashTag,
  createCallCorrelationKey,
  createPolicyKey,
  createStageKeys,
  encodeKeyPart,
  isValidClientCallId,
  normalizeIdentityPart,
} = require("./keyBuilder");

const RATE_LIMIT_NAMESPACE = "rl:v1";
const CALL_CORRELATION_TTL_SECONDS = 120;
const REDIS_MIN_VERSION = "7.0.0";
const TOKEN_COST_SCALE = 1;
const CALL_PHASES = new Set(["init_pending", "call_user_consumed"]);

const ADMISSION_SCRIPT = String.raw`
local function current_time_ms()
  local time_parts = redis.call("TIME")
  return (tonumber(time_parts[1]) * 1000) + math.floor(tonumber(time_parts[2]) / 1000)
end

local mode = ARGV[1]
local bucket_count = tonumber(ARGV[2])
local cursor = 3
local buckets = {}

for index = 1, bucket_count do
  buckets[index] = {
    algorithm = ARGV[cursor],
    limit = tonumber(ARGV[cursor + 1]),
    window_ms = tonumber(ARGV[cursor + 2]),
    capacity = tonumber(ARGV[cursor + 3]),
  }
  cursor = cursor + 4
end

local event_id = ARGV[cursor]
cursor = cursor + 1
local caller = ARGV[cursor]
local callee = ARGV[cursor + 1]
local phase = ARGV[cursor + 2]
local correlation_ttl_seconds = tonumber(ARGV[cursor + 3])
local now_ms = current_time_ms()
local correlation_key = KEYS[bucket_count + 1]

if mode == "call" then
  local existing = redis.call("GET", correlation_key)
  if existing then
    local stored_caller, stored_callee, stored_phase = string.match(existing, "^v1|([^|]+)|([^|]+)|([^|]+)|")
    if stored_caller == caller and stored_callee == callee then
      if phase == "call_user_consumed" and stored_phase == "init_pending" then
        local ttl_ms = redis.call("PTTL", correlation_key)
        if ttl_ms > 0 then
          redis.call("PSETEX", correlation_key, ttl_ms, "v1|" .. caller .. "|" .. callee .. "|call_user_consumed|" .. event_id)
        end
        return { 1, 0, 0, "correlated" }
      end

      return { 1, 0, 0, "replay" }
    end

    -- A mismatched/corrupted binding is treated as a new logical attempt.
    -- The quota pass below charges it and replaces the short-lived marker;
    -- it never revives or extends the old binding.
  end
end

local rejected_index = 0
local retry_after_ms = 0

for index = 1, bucket_count do
  local bucket = buckets[index]
  local key = KEYS[index]

  if bucket.algorithm == "sliding_window" then
    local lower_bound = "(" .. tostring(now_ms - bucket.window_ms)
    local active_count = redis.call("ZCOUNT", key, lower_bound, "+inf")
    if active_count >= bucket.limit then
      local oldest = redis.call("ZRANGEBYSCORE", key, lower_bound, "+inf", "WITHSCORES", "LIMIT", 0, 1)
      local oldest_score = tonumber(oldest[2]) or now_ms
      rejected_index = index
      retry_after_ms = math.max(1, oldest_score + bucket.window_ms - now_ms)
      break
    end
  elseif bucket.algorithm == "token_bucket" then
    local capacity_credit = bucket.capacity * bucket.window_ms
    local credit = tonumber(redis.call("HGET", key, "credit"))
    local last_refill_ms = tonumber(redis.call("HGET", key, "last_refill_ms"))

    if not credit or not last_refill_ms then
      credit = capacity_credit
      last_refill_ms = now_ms
    else
      local elapsed_ms = math.max(0, now_ms - last_refill_ms)
      credit = math.min(capacity_credit, credit + (elapsed_ms * bucket.limit))
    end

    if credit < ${TOKEN_COST_SCALE} * bucket.window_ms then
      rejected_index = index
      retry_after_ms = math.max(1, math.ceil(((${TOKEN_COST_SCALE} * bucket.window_ms) - credit) / bucket.limit))
      break
    end
  else
    return { 0, 0, 0, "invalid_policy" }
  end
end

if rejected_index > 0 then
  return { 0, rejected_index, retry_after_ms, "rate_limited" }
end

for index = 1, bucket_count do
  local bucket = buckets[index]
  local key = KEYS[index]

  if bucket.algorithm == "sliding_window" then
    redis.call("ZREMRANGEBYSCORE", key, 0, now_ms - bucket.window_ms)
    redis.call("ZADD", key, now_ms, event_id .. ":" .. tostring(index))
    redis.call("PEXPIRE", key, bucket.window_ms)
  else
    local capacity_credit = bucket.capacity * bucket.window_ms
    local credit = tonumber(redis.call("HGET", key, "credit"))
    local last_refill_ms = tonumber(redis.call("HGET", key, "last_refill_ms"))

    if not credit or not last_refill_ms then
      credit = capacity_credit
      last_refill_ms = now_ms
    else
      local elapsed_ms = math.max(0, now_ms - last_refill_ms)
      credit = math.min(capacity_credit, credit + (elapsed_ms * bucket.limit))
    end

    credit = credit - (${TOKEN_COST_SCALE} * bucket.window_ms)
    redis.call("HSET", key, "credit", credit, "last_refill_ms", now_ms)
    local refill_ttl_ms = math.max(1, math.ceil((capacity_credit - credit) / bucket.limit))
    redis.call("PEXPIRE", key, refill_ttl_ms)
  end
end

if mode == "call" then
  redis.call("PSETEX", correlation_key, correlation_ttl_seconds * 1000, "v1|" .. caller .. "|" .. callee .. "|" .. phase .. "|" .. event_id)
  return { 1, 0, 0, "charged" }
end

return { 1, 0, 0, "allowed" }
`;

const createDistributedRateLimiter = ({ redisClient, keyPrefix = RATE_LIMIT_NAMESPACE } = {}) => {
  if (!redisClient || typeof redisClient.eval !== "function") {
    throw new TypeError("Distributed rate limiter requires a Redis client with EVAL support");
  }

  const getPolicyKey = (policyId, context) => createPolicyKey(getPolicy(policyId), { ...context, keyPrefix });
  const getStageKeys = (policyIds, context) => createStageKeys(policyIds, context, keyPrefix);
  const getCallCorrelationKey = ({ caller, callee, clientCallId }) => createCallCorrelationKey({
    keyPrefix,
    caller,
    callee,
    clientCallId,
  });

  const execute = async ({ mode = "quota", policyIds, context, caller, callee, clientCallId, phase }) => {
    if (!Array.isArray(policyIds) || policyIds.length === 0) {
      throw new Error("Rate-limit admission requires approved policy IDs");
    }
    const policies = policyIds.map(getPolicy);
    const keys = getStageKeys(policyIds, context);
    if (mode === "call") {
      keys.push(getCallCorrelationKey({ caller, callee, clientCallId }));
    }
    assertSameHashTag(keys);

    const args = [mode, String(policies.length)];
    policies.forEach((policy) => {
      args.push(
        policy.algorithm,
        String(policy.limit),
        String(policy.windowMs),
        String(policy.capacity || 0),
      );
    });
    args.push(
      crypto.randomUUID(),
      caller ? encodeKeyPart(caller) : "",
      callee ? encodeKeyPart(callee) : "",
      phase || "",
      String(CALL_CORRELATION_TTL_SECONDS),
    );

    const reply = await redisClient.eval(ADMISSION_SCRIPT, { keys, arguments: args });
    if (!Array.isArray(reply) || reply.length < 4) {
      throw new Error("Redis rate-limit admission returned an invalid response");
    }
    return {
      allowed: Number(reply?.[0]) === 1,
      policyId: Number(reply?.[1]) > 0 ? policyIds[Number(reply[1]) - 1] : null,
      retryAfterMs: Number(reply?.[2]) || 0,
      kind: String(reply?.[3] || "unknown"),
    };
  };

  const unavailable = (error) => ({
    allowed: false,
    unavailable: true,
    code: "RATE_LIMIT_UNAVAILABLE",
    error,
  });

  const admit = async ({ policyIds, actor, conversationId } = {}) => {
    try {
      return await execute({
        policyIds,
        context: { actor, conversationId },
      });
    } catch (error) {
      return unavailable(error);
    }
  };

  const admitLogicalCall = async ({ caller, callee, clientCallId, phase = "call_user_consumed" } = {}) => {
    try {
      if (!CALL_PHASES.has(phase)) {
        throw new Error("Call protocol phase is invalid");
      }
      const canonicalCaller = normalizeIdentityPart(caller, "caller");
      const canonicalCallee = normalizeIdentityPart(callee, "callee");
      const effectiveClientCallId = isValidClientCallId(clientCallId)
        ? clientCallId
        : `unmatched_${crypto.randomUUID()}`;
      const result = await execute({
        mode: "call",
        policyIds: ["call_initiation"],
        context: { actor: { kind: "socket_user", value: canonicalCaller } },
        caller: canonicalCaller,
        callee: canonicalCallee,
        clientCallId: effectiveClientCallId,
        phase,
      });
      if (result.kind === "conflict") return { ...result, allowed: false, conflict: true };
      return result;
    } catch (error) {
      return { ...unavailable(error), kind: "unavailable" };
    }
  };

  return {
    admit,
    admitLogicalCall,
    getCallCorrelationKey: ({ caller, callee = "unknown", clientCallId }) => getCallCorrelationKey({ caller, callee, clientCallId }),
    getPolicyKey,
    getStageKeys,
    keyPrefix,
    policies: POLICIES,
  };
};

const getRateLimitRedisClient = (env = process.env) => {
  const roots = String(env.REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (roots.length > 0) {
    const client = createCluster({ rootNodes: roots.map((url) => ({ url })) });
    client.rateLimitTopology = { mode: "cluster", rootNodes: roots };
    return client;
  }

  const url = env.REDIS_RATE_LIMIT_URL || env.REDIS_URL || `redis://${env.REDIS_HOST || "redis"}:${env.REDIS_PORT || 6379}`;
  const client = createClient({ url });
  client.rateLimitTopology = { mode: "standalone", url };
  return client;
};

module.exports = {
  ADMISSION_SCRIPT,
  CALL_CORRELATION_TTL_SECONDS,
  CALL_PHASES,
  RATE_LIMIT_NAMESPACE,
  REDIS_MIN_VERSION,
  createDistributedRateLimiter,
  getRateLimitRedisClient,
};
