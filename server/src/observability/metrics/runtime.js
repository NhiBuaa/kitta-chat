const { createMetricsModule } = require("./index");
const { logSafely, logger } = require("../../utils/logger");

let defaultMetrics;

const getDefaultMetrics = () => {
  if (!defaultMetrics) {
    defaultMetrics = createMetricsModule();
  }
  return defaultMetrics;
};

const setDefaultMetrics = (metrics) => {
  defaultMetrics = metrics;
  return defaultMetrics;
};

const observe = (metrics, method, payload, metric) => {
  try {
    const target = metrics || getDefaultMetrics();
    if (typeof target?.[method] === "function") {
      target[method](payload);
    }
  } catch (error) {
    logSafely(logger, "warn", "metrics_observation_failed", {
      metric,
      error_type: error?.name || "Error",
    });
  }
};

const observeRedisOperation = (metrics, payload) =>
  observe(metrics, "observeRedisOperation", payload, "kittachat_redis_operations_total");

const observeCacheFallback = (metrics, payload) =>
  observe(metrics, "observeCacheFallback", payload, "kittachat_cache_fallbacks_total");

module.exports = {
  getDefaultMetrics,
  setDefaultMetrics,
  observeRedisOperation,
  observeCacheFallback,
};
