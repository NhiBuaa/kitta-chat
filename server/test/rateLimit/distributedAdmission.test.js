const assert = require("node:assert/strict");
const test = require("node:test");
const { createClient, createCluster } = require("redis");

const {
  createDistributedRateLimiter,
  getRateLimitRedisClient,
  REDIS_MIN_VERSION,
} = require("../../src/rateLimit/distributedRateLimiter");

const standaloneUrl = process.env.RATE_LIMIT_REDIS_URL;
const clusterUrls = process.env.RATE_LIMIT_REDIS_CLUSTER_URLS
  ? process.env.RATE_LIMIT_REDIS_CLUSTER_URLS.split(",").map((value) => value.trim()).filter(Boolean)
  : [];

const describeRedisTest = (name, options, handler) => {
  test(name, { skip: !options.enabled }, handler);
};

const uniqueActor = (label) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createConnection = async ({ cluster = false } = {}) => {
  const client = cluster
    ? createCluster({ rootNodes: clusterUrls.map((url) => ({ url })) })
    : createClient({ url: standaloneUrl });
  await client.connect();
  return client;
};

const closeConnection = async (client) => {
  if (client?.isOpen) await client.quit();
};

const runWithRedis = async ({ cluster = false }, callback) => {
  const client = await createConnection({ cluster });
  try {
    return await callback(client);
  } finally {
    await closeConnection(client);
  }
};

describeRedisTest(
  "standalone Redis: multi-bucket admission is atomic all-or-none",
  { enabled: Boolean(standaloneUrl) },
  async () => {
    await runWithRedis({}, async (redisClient) => {
      const limiter = createDistributedRateLimiter({
        redisClient,
        keyPrefix: `test:atomic:${Date.now()}`,
      });
      const actor = uniqueActor("atomic");

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const result = await limiter.admit({
          policyIds: ["auth_entry.aggregate", "auth_entry.login"],
          actor: { kind: "network", value: actor },
        });
        assert.equal(result.allowed, true);
      }

      const rejected = await limiter.admit({
        policyIds: ["auth_entry.aggregate", "auth_entry.login"],
        actor: { kind: "network", value: actor },
      });
      assert.equal(rejected.allowed, false);
      assert.equal(rejected.policyId, "auth_entry.login");

      let googleAllowed = 0;
      for (let attempt = 0; attempt < 11; attempt += 1) {
        const result = await limiter.admit({
          policyIds: ["auth_entry.aggregate", "auth_entry.google"],
          actor: { kind: "network", value: actor },
        });
        if (!result.allowed) break;
        googleAllowed += 1;
      }

      assert.equal(googleAllowed, 10);
    });
  },
);

describeRedisTest(
  "standalone Redis: token bucket starts full and does not create an early free burst",
  { enabled: Boolean(standaloneUrl) },
  async () => {
    await runWithRedis({}, async (redisClient) => {
      const limiter = createDistributedRateLimiter({
        redisClient,
        keyPrefix: `test:bucket:${Date.now()}`,
      });
      const actor = uniqueActor("bucket");

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await limiter.admit({
          policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
          actor: { kind: "user", value: actor },
        });
        assert.equal(result.allowed, true);
      }

      const key = limiter.getPolicyKey("read_expensive.message_sync", {
        actor: { kind: "user", value: actor },
      });
      const creditBeforeReject = await redisClient.hGet(key, "credit");
      const ttlAfterBurst = await redisClient.pTTL(key);
      assert.ok(ttlAfterBurst > 15_000, `expected refill TTL > 15s, got ${ttlAfterBurst}`);

      const rejected = await limiter.admit({
        policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
        actor: { kind: "user", value: actor },
      });
      assert.equal(rejected.allowed, false);
      assert.equal(rejected.policyId, "read_expensive.message_sync");
      assert.equal(await redisClient.hGet(key, "credit"), creditBeforeReject);

      await new Promise((resolve) => setTimeout(resolve, 5_100));
      const refilled = await limiter.admit({
        policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
        actor: { kind: "user", value: actor },
      });
      assert.equal(refilled.allowed, true);
    });
  },
);

describeRedisTest(
  "standalone Redis: call correlation charges once and replay does not refresh TTL",
  { enabled: Boolean(standaloneUrl) },
  async () => {
    await runWithRedis({}, async (redisClient) => {
      const limiter = createDistributedRateLimiter({
        redisClient,
        keyPrefix: `test:call:${Date.now()}`,
      });
      const caller = uniqueActor("caller");
      const callee = uniqueActor("callee");
      const callId = `temp_${uniqueActor("call")}`;

      const init = await limiter.admitLogicalCall({ caller, callee, clientCallId: callId, phase: "init_pending" });
      assert.equal(init.kind, "charged");

      const correlated = await limiter.admitLogicalCall({ caller, callee, clientCallId: callId });
      assert.equal(correlated.kind, "correlated");

      const markerKey = limiter.getCallCorrelationKey({ caller, callee, clientCallId: callId });
      const ttlBeforeReplay = await redisClient.pTTL(markerKey);
      assert.ok(ttlBeforeReplay > 0);
      const replay = await limiter.admitLogicalCall({ caller, callee, clientCallId: callId });
      assert.equal(replay.kind, "replay");
      const ttlAfterReplay = await redisClient.pTTL(markerKey);
      assert.ok(ttlAfterReplay <= ttlBeforeReplay);

      const changedBinding = await limiter.admitLogicalCall({
        caller,
        callee: `${callee}-changed`,
        clientCallId: callId,
      });
      assert.equal(changedBinding.kind, "charged");

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const unmatched = await limiter.admitLogicalCall({
          caller,
          callee,
          clientCallId: `temp_${uniqueActor("unmatched")}`,
        });
        assert.equal(unmatched.kind, "charged");
      }

      const exhausted = await limiter.admitLogicalCall({
        caller,
        callee,
        clientCallId: `temp_${uniqueActor("exhausted")}`,
      });
      assert.equal(exhausted.allowed, false);
      assert.equal(exhausted.kind, "rate_limited");
    });
  },
);

describeRedisTest(
  "standalone Redis: concurrent logical call contenders charge once and suppress duplicates",
  { enabled: Boolean(standaloneUrl) },
  async () => {
    const concurrentPrefix = `test:call-concurrent:${Date.now()}`;
    const concurrentCaller = uniqueActor("concurrent-caller");
    const concurrentCallee = uniqueActor("concurrent-callee");
    const concurrentCallId = `temp_${uniqueActor("concurrent-call")}`;
    const contenders = [];

    try {
      contenders.push(await createConnection(), await createConnection());
      const concurrentLimiters = contenders.map((client) => createDistributedRateLimiter({
        redisClient: client,
        keyPrefix: concurrentPrefix,
      }));

      const initResults = await Promise.all(concurrentLimiters.map((concurrentLimiter) => (
        concurrentLimiter.admitLogicalCall({
          caller: concurrentCaller,
          callee: concurrentCallee,
          clientCallId: concurrentCallId,
          phase: "init_pending",
        })
      )));
      assert.deepEqual(new Set(initResults.map((result) => result.kind)), new Set(["charged", "replay"]));
      assert.ok(initResults.every((result) => result.allowed));

      const quotaKey = concurrentLimiters[0].getStageKeys(
        ["call_initiation"],
        { actor: { kind: "socket_user", value: concurrentCaller } },
      )[0];
      const markerKey = concurrentLimiters[0].getCallCorrelationKey({
        caller: concurrentCaller,
        callee: concurrentCallee,
        clientCallId: concurrentCallId,
      });
      assert.equal(await contenders[0].zCard(quotaKey), 1);
      assert.ok((await contenders[0].pTTL(markerKey)) > 0);

      const correlatedResults = await Promise.all(concurrentLimiters.map((concurrentLimiter) => (
        concurrentLimiter.admitLogicalCall({
          caller: concurrentCaller,
          callee: concurrentCallee,
          clientCallId: concurrentCallId,
        })
      )));
      assert.deepEqual(new Set(correlatedResults.map((result) => result.kind)), new Set(["correlated", "replay"]));
      assert.ok(correlatedResults.every((result) => result.allowed));
      assert.equal(await contenders[0].zCard(quotaKey), 1);

      const markerValue = await contenders[0].get(markerKey);
      assert.match(markerValue || "", /^v1\|[^|]+\|[^|]+\|call_user_consumed\|[^|]+$/);
    } finally {
      await Promise.all(contenders.map(closeConnection));
    }
  },
);

describeRedisTest(
  "native three-primary Redis Cluster: all stage keys share one slot",
  { enabled: clusterUrls.length > 0 },
  async () => {
    await runWithRedis({ cluster: true }, async (redisClient) => {
      const limiter = createDistributedRateLimiter({
        redisClient,
        keyPrefix: `test:cluster:${Date.now()}`,
      });
      const actor = uniqueActor("cluster");
      const stageCases = [
        {
          policyIds: ["auth_entry.aggregate", "auth_entry.login"],
          context: { actor: { kind: "network", value: actor } },
        },
        {
          policyIds: ["state_mutation.aggregate", "state_mutation.friendship"],
          context: { actor: { kind: "user", value: actor } },
        },
        {
          policyIds: ["file_resource.aggregate", "file_resource.part_presign"],
          context: { actor: { kind: "user", value: actor } },
        },
        {
          policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
          context: { actor: { kind: "user", value: actor } },
        },
        {
          policyIds: [
            "read_expensive.aggregate",
            "read_expensive.conversation_panel",
            "read_expensive.panel_resources",
          ],
          context: { actor: { kind: "user", value: actor }, conversationId: "conversation-1" },
        },
      ];
      for (const { policyIds, context } of stageCases) {
        const keys = limiter.getStageKeys(policyIds, context);
        const slots = await Promise.all(keys.map((key) => redisClient.sendCommand(
          key,
          false,
          ["CLUSTER", "KEYSLOT", key],
        )));
        assert.equal(new Set(slots).size, 1, policyIds.join(","));
      }

      const callQuotaKey = limiter.getStageKeys(
        ["call_initiation"],
        { actor: { kind: "socket_user", value: actor } },
      )[0];
      const correlationKey = limiter.getCallCorrelationKey({
        caller: actor,
        callee: uniqueActor("callee"),
        clientCallId: `temp_${uniqueActor("call")}`,
      });
      const callSlots = await Promise.all([callQuotaKey, correlationKey].map((key) => redisClient.sendCommand(
        key,
        false,
        ["CLUSTER", "KEYSLOT", key],
      )));
      assert.equal(new Set(callSlots).size, 1, "call quota + correlation");

      const result = await limiter.admit({
        policyIds: ["read_expensive.aggregate", "read_expensive.conversation_panel", "read_expensive.panel_resources"],
        actor: { kind: "user", value: actor },
        conversationId: "conversation-1",
      });
      assert.equal(result.allowed, true);

      const caller = uniqueActor("cluster-caller");
      const callee = uniqueActor("cluster-callee");
      const callId = `temp_${uniqueActor("cluster-call")}`;
      assert.equal((await limiter.admitLogicalCall({
        caller,
        callee,
        clientCallId: callId,
        phase: "init_pending",
      })).kind, "charged");
      assert.equal((await limiter.admitLogicalCall({
        caller,
        callee,
        clientCallId: callId,
      })).kind, "correlated");
    });
  },
);

test("rate-limit Redis client selects the explicit cluster topology", () => {
  assert.equal(REDIS_MIN_VERSION, "7.0.0");
  const clusterClient = getRateLimitRedisClient({
    REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES: "redis://127.0.0.1:7000,redis://127.0.0.1:7001",
    REDIS_URL: "redis://127.0.0.1:6379",
  });
  assert.equal(clusterClient.rateLimitTopology.mode, "cluster");
  assert.deepEqual(clusterClient.rateLimitTopology.rootNodes, [
    "redis://127.0.0.1:7000",
    "redis://127.0.0.1:7001",
  ]);
});

test("malformed Redis admission replies fail closed as unavailable", async () => {
  const limiter = createDistributedRateLimiter({
    redisClient: {
      async eval() {
        return undefined;
      },
    },
    keyPrefix: `test:invalid-reply:${Date.now()}`,
  });

  const result = await limiter.admit({
    policyIds: ["auth_entry.aggregate"],
    actor: { kind: "network", value: uniqueActor("invalid-reply") },
  });
  assert.equal(result.unavailable, true);
  assert.equal(result.code, "RATE_LIMIT_UNAVAILABLE");
});

test("call admission rejects protocol phases outside the single-use contract", async () => {
  const limiter = createDistributedRateLimiter({
    redisClient: { async eval() { throw new Error("should not execute"); } },
    keyPrefix: `test:phase:${Date.now()}`,
  });
  const result = await limiter.admitLogicalCall({
    caller: "caller",
    callee: "callee",
    clientCallId: "temp_call",
    phase: "unexpected",
  });
  assert.equal(result.unavailable, true);
  assert.equal(result.code, "RATE_LIMIT_UNAVAILABLE");
});
