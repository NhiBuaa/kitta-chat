const {
  HTTP_REQUEST_DURATION_BUCKETS,
  MESSAGE_PERSISTENCE_DURATION_BUCKETS,
} = require("./histogramBuckets");

const freeze = (value) => Object.freeze(value);

const METRIC_CATALOG = freeze({
  httpRequests: freeze({
    name: "kittachat_http_requests_total",
    type: "counter",
    labelNames: freeze(["method", "route_template", "status_class"]),
  }),
  httpRequestDuration: freeze({
    name: "kittachat_http_request_duration_seconds",
    type: "histogram",
    labelNames: freeze(["method", "route_template", "status_class"]),
    buckets: HTTP_REQUEST_DURATION_BUCKETS,
  }),
  socketActiveConnections: freeze({
    name: "kittachat_socket_active_connections",
    type: "gauge",
    labelNames: freeze([]),
  }),
  messagePersistenceDuration: freeze({
    name: "kittachat_message_persistence_duration_seconds",
    type: "histogram",
    labelNames: freeze(["outcome"]),
    buckets: MESSAGE_PERSISTENCE_DURATION_BUCKETS,
  }),
  redisOperations: freeze({
    name: "kittachat_redis_operations_total",
    type: "counter",
    labelNames: freeze(["operation", "outcome"]),
  }),
  cacheFallbacks: freeze({
    name: "kittachat_cache_fallbacks_total",
    type: "counter",
    labelNames: freeze(["reason"]),
  }),
  queueJobs: freeze({
    name: "kittachat_queue_jobs_total",
    type: "counter",
    labelNames: freeze(["queue", "job_type", "outcome"]),
  }),
  queueDeadLettered: freeze({
    name: "kittachat_queue_dead_lettered_total",
    type: "counter",
    labelNames: freeze(["queue", "job_type", "reason"]),
  }),
});

const ALLOWLISTS = freeze({
  httpMethods: freeze(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "OTHER"]),
  routeTemplates: freeze([
    "/healthz",
    "/readyz",
    "/ops",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/google",
    "/api/auth/session",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/reset-password/:id",
    "/api/users",
    "/api/users/:id",
    "/api/messages",
    "/api/messages/sync",
    "/api/messages/:userId1/:userId2",
    "/api/calls/history",
    "/api/calls/missed",
    "/api/groups",
    "/api/groups/:groupId",
    "/api/files",
    "/api/conversations/:id/panel/metadata",
    "/api/conversations/:id/panel/preference",
    "/api/conversations/:id/panel/resources",
    "/api/sidebar/conversations",
  ]),
  statusClasses: freeze(["1xx", "2xx", "3xx", "4xx", "5xx"]),
  messageOutcomes: freeze(["success", "failed"]),
  redisOperations: freeze(["get", "set", "set_ex", "del"]),
  redisOutcomes: freeze(["success", "error"]),
  fallbackReasons: freeze(["miss", "redis_error"]),
  queues: freeze(["image", "notification", "audit", "default", "OTHER"]),
  jobTypes: freeze(["chat-image", "avatar-image", "email.password_reset", "message.created", "OTHER"]),
  queueOutcomes: freeze(["processed", "retried", "failed"]),
  deadLetterReasons: freeze(["poison", "retry_exhausted"]),
});

module.exports = { ALLOWLISTS, METRIC_CATALOG };
