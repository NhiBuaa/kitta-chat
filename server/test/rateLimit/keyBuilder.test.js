const assert = require("node:assert/strict");
const test = require("node:test");

const {
  APPROVED_ENFORCEMENT_POINT_COUNT,
  POLICIES,
} = require("../../src/rateLimit/closureMinimumPolicyCatalog");
const {
  assertSameHashTag,
  createCallCorrelationKey,
  createStageKeys,
  extractHashTag,
} = require("../../src/rateLimit/keyBuilder");

test("closure-minimum catalog contains exactly the approved 27 policies", () => {
  assert.equal(APPROVED_ENFORCEMENT_POINT_COUNT, 27);
  assert.equal(Object.keys(POLICIES).length, 27);
  assert.equal(POLICIES["auth_refresh.stage_a"].capacity, 10);
  assert.equal(POLICIES["auth_refresh.stage_b"].capacity, 5);
  assert.equal(POLICIES["read_expensive.message_sync"].limit, 12);
  assert.equal(POLICIES.call_initiation.algorithm, "sliding_window");
});

test("every mandatory multi-bucket stage uses one explicit hash tag", () => {
  const stages = [
    {
      ids: ["auth_entry.aggregate", "auth_entry.login"],
      context: { actor: { kind: "network", value: "203.0.113.10" } },
    },
    {
      ids: ["state_mutation.aggregate", "state_mutation.friendship"],
      context: { actor: { kind: "user", value: "user-1" } },
    },
    {
      ids: ["file_resource.aggregate", "file_resource.part_presign"],
      context: { actor: { kind: "user", value: "user-1" } },
    },
    {
      ids: ["read_expensive.aggregate", "read_expensive.message_sync"],
      context: { actor: { kind: "user", value: "user-1" } },
    },
    {
      ids: [
        "read_expensive.aggregate",
        "read_expensive.conversation_panel",
        "read_expensive.panel_resources",
      ],
      context: { actor: { kind: "user", value: "user-1" }, conversationId: "conv-1" },
    },
  ];

  stages.forEach(({ ids, context }) => {
    const keys = createStageKeys(ids, context, "rl:v1");
    assert.equal(new Set(keys.map(extractHashTag)).size, 1);
    assert.doesNotThrow(() => assertSameHashTag(keys));
  });

  const panelA = createStageKeys(
    ["read_expensive.aggregate", "read_expensive.conversation_panel", "read_expensive.panel_resources"],
    { actor: { kind: "user", value: "user-1" }, conversationId: "conversation-a" },
    "rl:v1",
  );
  const panelB = createStageKeys(
    ["read_expensive.aggregate", "read_expensive.conversation_panel", "read_expensive.panel_resources"],
    { actor: { kind: "user", value: "user-1" }, conversationId: "conversation-b" },
    "rl:v1",
  );
  assert.notEqual(panelA[2], panelB[2]);
  assert.equal(extractHashTag(panelA[0]), extractHashTag(panelB[0]));
  assert.equal(extractHashTag(panelA[2]), extractHashTag(panelB[2]));

  const callQuotaKey = createStageKeys(
    ["call_initiation"],
    { actor: { kind: "socket_user", value: "user-1" } },
    "rl:v1",
  )[0];
  const correlationKey = createCallCorrelationKey({
    keyPrefix: "rl:v1",
    caller: "user-1",
    callee: "user-2",
    clientCallId: "temp_call-1",
  });
  assert.equal(extractHashTag(callQuotaKey), extractHashTag(correlationKey));
});

test("key builder rejects cross-slot admission inputs instead of offering sequential fallback", () => {
  assert.throws(
    () => assertSameHashTag([
      "rl:v1:{user:1}:state_mutation.aggregate",
      "rl:v1:{user:2}:state_mutation.profile",
    ]),
    /share one Redis Cluster hash tag/,
  );
});
