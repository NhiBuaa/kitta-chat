const { ALLOWLISTS, METRIC_CATALOG } = require("./metricCatalog");

const has = (values, value) => values.includes(value);

class MetricsModule {
  constructor({ adapter, logger = console, metricCatalog = {} }) {
    if (!adapter || typeof adapter.registerMetric !== "function") {
      throw new TypeError("MetricsModule requires a metrics adapter");
    }
    this.adapter = adapter;
    this.logger = logger;
    this.catalog = { ...METRIC_CATALOG, ...metricCatalog };
    Object.values(this.catalog).forEach((definition) => this.adapter.registerMetric(definition));
  }

  warn(event, details) {
    if (typeof this.logger?.warn === "function") {
      this.logger.warn({ event, ...details });
    }
  }

  observe(name, labels, value) {
    try {
      this.adapter.observe(name, labels, value);
    } catch (error) {
      this.warn("metrics_observation_failed", {
        metric: name,
        error_type: error?.name || "Error",
      });
    }
  }

  drop(name, reason) {
    this.warn("metrics_observation_dropped", { metric: name, reason });
  }

  observeHttpRequest({ method, routeTemplate, statusClass, durationSeconds } = {}) {
    const normalizedMethod = has(ALLOWLISTS.httpMethods, method) ? method : "OTHER";
    const normalizedRoute = !routeTemplate
      ? "NOT_FOUND"
      : has(ALLOWLISTS.routeTemplates, routeTemplate) ? routeTemplate : "UNMAPPED_ROUTE";
    if (!has(ALLOWLISTS.statusClasses, statusClass) || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      this.drop(this.catalog.httpRequests.name, "invalid_status_or_duration");
      return;
    }
    const labels = {
      method: normalizedMethod,
      route_template: normalizedRoute,
      status_class: statusClass,
    };
    this.observe(this.catalog.httpRequests.name, labels, 1);
    this.observe(this.catalog.httpRequestDuration.name, labels, durationSeconds);
  }

  observeSocketConnection({ event } = {}) {
    if (!has(["connected", "disconnected"], event)) {
      this.drop(this.catalog.socketActiveConnections.name, "invalid_event");
      return;
    }
    this.observe(this.catalog.socketActiveConnections.name, {}, event === "connected" ? 1 : -1);
  }

  observeMessagePersistence({ outcome, durationSeconds } = {}) {
    if (!has(ALLOWLISTS.messageOutcomes, outcome) || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      this.drop(this.catalog.messagePersistenceDuration.name, "invalid_outcome_or_duration");
      return;
    }
    this.observe(this.catalog.messagePersistenceDuration.name, { outcome }, durationSeconds);
  }

  observeRedisOperation({ operation, outcome } = {}) {
    if (!has(ALLOWLISTS.redisOperations, operation) || !has(ALLOWLISTS.redisOutcomes, outcome)) {
      this.drop(this.catalog.redisOperations.name, "invalid_operation_or_outcome");
      return;
    }
    this.observe(this.catalog.redisOperations.name, { operation, outcome }, 1);
  }

  observeCacheFallback({ reason } = {}) {
    if (!has(ALLOWLISTS.fallbackReasons, reason)) {
      this.drop(this.catalog.cacheFallbacks.name, "invalid_reason");
      return;
    }
    this.observe(this.catalog.cacheFallbacks.name, { reason }, 1);
  }

  observeQueueJob({ queue, jobType, outcome } = {}) {
    const normalizedQueue = has(ALLOWLISTS.queues, queue) ? queue : "OTHER";
    const normalizedJobType = has(ALLOWLISTS.jobTypes, jobType) ? jobType : "OTHER";
    if (!has(ALLOWLISTS.queueOutcomes, outcome)) {
      this.drop(this.catalog.queueJobs.name, "invalid_outcome");
      return;
    }
    this.observe(this.catalog.queueJobs.name, {
      queue: normalizedQueue,
      job_type: normalizedJobType,
      outcome,
    }, 1);
  }

  observeQueueDeadLettered({ queue, jobType, reason } = {}) {
    const normalizedQueue = has(ALLOWLISTS.queues, queue) ? queue : "OTHER";
    const normalizedJobType = has(ALLOWLISTS.jobTypes, jobType) ? jobType : "OTHER";
    if (!has(ALLOWLISTS.deadLetterReasons, reason)) {
      this.drop(this.catalog.queueDeadLettered.name, "invalid_reason");
      return;
    }
    this.observe(this.catalog.queueDeadLettered.name, {
      queue: normalizedQueue,
      job_type: normalizedJobType,
      reason,
    }, 1);
  }

  renderPrometheus() {
    return this.adapter.render();
  }
}

module.exports = { MetricsModule };
