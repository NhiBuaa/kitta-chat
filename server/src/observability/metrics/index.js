const { MetricsModule } = require("./metricsModule");
const { InMemoryMetricsAdapter } = require("./adapters/inMemoryMetricsAdapter");
const { PromClientMetricsAdapter } = require("./adapters/promClientMetricsAdapter");

const createMetricsModule = (options = {}) => new MetricsModule({
  adapter: options.adapter || new PromClientMetricsAdapter(),
  logger: options.logger,
  metricCatalog: options.metricCatalog,
});

const createInMemoryMetricsAdapter = () => new InMemoryMetricsAdapter();
const createPromClientMetricsAdapter = (options) => new PromClientMetricsAdapter(options);

module.exports = {
  MetricsModule,
  InMemoryMetricsAdapter,
  PromClientMetricsAdapter,
  createMetricsModule,
  createInMemoryMetricsAdapter,
  createPromClientMetricsAdapter,
};
