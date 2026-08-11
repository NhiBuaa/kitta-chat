const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const freezePolicy = (policy) => Object.freeze(policy);

const sliding = (id, limit, windowMs, scope, domain = null) => freezePolicy({
  id,
  algorithm: "sliding_window",
  limit,
  windowMs,
  scope,
  domain,
});

const bucket = (id, refillPerWindow, windowMs, capacity, scope, domain = null) => freezePolicy({
  id,
  algorithm: "token_bucket",
  limit: refillPerWindow,
  windowMs,
  scope,
  domain,
  capacity,
});

const POLICIES = Object.freeze({
  "auth_entry.aggregate": sliding("auth_entry.aggregate", 20, 15 * MINUTE_MS, "network"),
  "auth_entry.login": sliding("auth_entry.login", 10, 15 * MINUTE_MS, "network", "login"),
  "auth_entry.register": sliding("auth_entry.register", 5, HOUR_MS, "network", "register"),
  "auth_entry.google": sliding("auth_entry.google", 10, 15 * MINUTE_MS, "network", "google"),
  "auth_recovery_request": sliding("auth_recovery_request", 5, HOUR_MS, "network"),
  "auth_recovery_complete": sliding("auth_recovery_complete", 10, 15 * MINUTE_MS, "network"),
  "auth_refresh.stage_a": bucket("auth_refresh.stage_a", 60, MINUTE_MS, 10, "network"),
  "auth_refresh.stage_b": bucket("auth_refresh.stage_b", 20, MINUTE_MS, 5, "subject"),
  "state_mutation.aggregate": bucket("state_mutation.aggregate", 120, MINUTE_MS, 30, "user"),
  "state_mutation.profile": bucket("state_mutation.profile", 10, HOUR_MS, 3, "user", "profile"),
  "state_mutation.friendship": bucket("state_mutation.friendship", 30, MINUTE_MS, 10, "user", "friendship"),
  "state_mutation.group_admin": bucket("state_mutation.group_admin", 30, MINUTE_MS, 10, "user", "group_admin"),
  "state_mutation.conversation_panel": bucket("state_mutation.conversation_panel", 60, MINUTE_MS, 15, "user", "conversation_panel"),
  "state_mutation.call_history": bucket("state_mutation.call_history", 120, MINUTE_MS, 30, "user", "call_history"),
  "file_resource.aggregate": bucket("file_resource.aggregate", 300, HOUR_MS, 50, "user"),
  "file_resource.upload_control": bucket("file_resource.upload_control", 30, HOUR_MS, 10, "user", "upload_control"),
  "file_resource.part_presign": bucket("file_resource.part_presign", 240, HOUR_MS, 40, "user", "part_presign"),
  "file_resource.download_signing": bucket("file_resource.download_signing", 120, HOUR_MS, 30, "user", "download_signing"),
  "read_expensive.aggregate": bucket("read_expensive.aggregate", 240, MINUTE_MS, 60, "user"),
  "read_expensive.user_directory": bucket("read_expensive.user_directory", 60, MINUTE_MS, 20, "user", "user_directory"),
  "read_expensive.message_sync": bucket("read_expensive.message_sync", 12, MINUTE_MS, 4, "user", "message_sync"),
  "read_expensive.call_history": bucket("read_expensive.call_history", 30, MINUTE_MS, 10, "user", "call_history"),
  "read_expensive.groups": bucket("read_expensive.groups", 60, MINUTE_MS, 20, "user", "groups"),
  "read_expensive.conversation_panel": bucket("read_expensive.conversation_panel", 60, MINUTE_MS, 20, "user", "conversation_panel"),
  "read_expensive.panel_resources": sliding("read_expensive.panel_resources", 30, MINUTE_MS, "user_conversation", "panel_resources"),
  "read_expensive.sidebar": bucket("read_expensive.sidebar", 60, MINUTE_MS, 20, "user", "sidebar"),
  "call_initiation": sliding("call_initiation", 10, MINUTE_MS, "socket_user"),
});

const APPROVED_POLICY_IDS = Object.freeze(Object.keys(POLICIES));
const APPROVED_ENFORCEMENT_POINT_COUNT = APPROVED_POLICY_IDS.length;

const getPolicy = (policyId) => {
  const policy = POLICIES[policyId];
  if (!policy) throw new Error(`Unknown approved rate-limit policy: ${policyId}`);
  return policy;
};

module.exports = {
  APPROVED_ENFORCEMENT_POINT_COUNT,
  APPROVED_POLICY_IDS,
  HOUR_MS,
  MINUTE_MS,
  POLICIES,
  getPolicy,
};
