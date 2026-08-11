const assert = require("node:assert/strict");
const test = require("node:test");

const { HOUR_MS, MINUTE_MS, POLICIES } = require("../../src/rateLimit/closureMinimumPolicyCatalog");

test("policy catalog preserves every approved numeric contract", () => {
  const expected = {
    "auth_entry.aggregate": ["sliding_window", 20, 15 * MINUTE_MS, undefined, "network"],
    "auth_entry.login": ["sliding_window", 10, 15 * MINUTE_MS, undefined, "network"],
    "auth_entry.register": ["sliding_window", 5, HOUR_MS, undefined, "network"],
    "auth_entry.google": ["sliding_window", 10, 15 * MINUTE_MS, undefined, "network"],
    "auth_recovery_request": ["sliding_window", 5, HOUR_MS, undefined, "network"],
    "auth_recovery_complete": ["sliding_window", 10, 15 * MINUTE_MS, undefined, "network"],
    "auth_refresh.stage_a": ["token_bucket", 60, MINUTE_MS, 10, "network"],
    "auth_refresh.stage_b": ["token_bucket", 20, MINUTE_MS, 5, "subject"],
    "state_mutation.aggregate": ["token_bucket", 120, MINUTE_MS, 30, "user"],
    "state_mutation.profile": ["token_bucket", 10, HOUR_MS, 3, "user"],
    "state_mutation.friendship": ["token_bucket", 30, MINUTE_MS, 10, "user"],
    "state_mutation.group_admin": ["token_bucket", 30, MINUTE_MS, 10, "user"],
    "state_mutation.conversation_panel": ["token_bucket", 60, MINUTE_MS, 15, "user"],
    "state_mutation.call_history": ["token_bucket", 120, MINUTE_MS, 30, "user"],
    "file_resource.aggregate": ["token_bucket", 300, HOUR_MS, 50, "user"],
    "file_resource.upload_control": ["token_bucket", 30, HOUR_MS, 10, "user"],
    "file_resource.part_presign": ["token_bucket", 240, HOUR_MS, 40, "user"],
    "file_resource.download_signing": ["token_bucket", 120, HOUR_MS, 30, "user"],
    "read_expensive.aggregate": ["token_bucket", 240, MINUTE_MS, 60, "user"],
    "read_expensive.user_directory": ["token_bucket", 60, MINUTE_MS, 20, "user"],
    "read_expensive.message_sync": ["token_bucket", 12, MINUTE_MS, 4, "user"],
    "read_expensive.call_history": ["token_bucket", 30, MINUTE_MS, 10, "user"],
    "read_expensive.groups": ["token_bucket", 60, MINUTE_MS, 20, "user"],
    "read_expensive.conversation_panel": ["token_bucket", 60, MINUTE_MS, 20, "user"],
    "read_expensive.panel_resources": ["sliding_window", 30, MINUTE_MS, undefined, "user_conversation"],
    "read_expensive.sidebar": ["token_bucket", 60, MINUTE_MS, 20, "user"],
    "call_initiation": ["sliding_window", 10, MINUTE_MS, undefined, "socket_user"],
  };

  assert.deepEqual(Object.keys(POLICIES).sort(), Object.keys(expected).sort());
  Object.entries(expected).forEach(([id, [algorithm, limit, windowMs, capacity, scope]]) => {
    assert.deepEqual([
      POLICIES[id].algorithm,
      POLICIES[id].limit,
      POLICIES[id].windowMs,
      POLICIES[id].capacity,
      POLICIES[id].scope,
    ], [algorithm, limit, windowMs, capacity, scope], id);
  });
});
