const createMetricsRoute = ({ metricsModule } = {}) => {
  if (!metricsModule || typeof metricsModule.renderPrometheus !== "function") {
    throw new TypeError("Metrics route requires a metrics module");
  }

  return async (_req, res, next) => {
    try {
      const { body, contentType } = await metricsModule.renderPrometheus();

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(body);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { createMetricsRoute };
