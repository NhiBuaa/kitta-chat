const { resolveRouteTemplate } = require("./routeTemplateResolver");
const { logSafely } = require("../../../utils/logger");

const getStatusClass = (statusCode) => {
  const numericStatus = Number(statusCode);
  if (!Number.isInteger(numericStatus) || numericStatus < 100 || numericStatus > 599) {
    return undefined;
  }

  return `${Math.floor(numericStatus / 100)}xx`;
};

const getRequestPath = (req) => (req.originalUrl || req.url || "").split("?", 1)[0];

const createHttpMetricsMiddleware = ({ metricsModule, logger = console } = {}) => {
  if (!metricsModule || typeof metricsModule.observeHttpRequest !== "function") {
    throw new TypeError("HTTP metrics middleware requires a metrics module");
  }

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    let observed = false;

    const observeResponse = () => {
      if (observed) return;
      observed = true;

      try {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        metricsModule.observeHttpRequest({
          method: req.method,
          routeTemplate: resolveRouteTemplate(req),
          statusClass: getStatusClass(res.statusCode),
          durationSeconds,
        });
      } catch (error) {
        logSafely(logger, "warn", "http_metrics_observation_failed", {
          error_type: error?.name || "Error",
        });
      }
    };

    if (getRequestPath(req) !== "/metrics") {
      res.once("finish", observeResponse);
    }

    next();
  };
};

module.exports = {
  createHttpMetricsMiddleware,
  getRequestPath,
  getStatusClass,
};
