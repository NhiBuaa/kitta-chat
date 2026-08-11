const client = require("prom-client");

const sameDefinition = (metric, definition) => {
  const labelNames = metric.labelNames || [];
  const buckets = metric.buckets || [];
  return metric.type === definition.type
    && JSON.stringify(labelNames) === JSON.stringify(definition.labelNames)
    && JSON.stringify(buckets) === JSON.stringify(definition.buckets || []);
};

class PromClientMetricsAdapter {
  constructor({ registry = new client.Registry() } = {}) {
    this.registry = registry;
    this.metrics = new Map();
  }

  registerMetric(definition) {
    const existing = this.registry.getSingleMetric(definition.name);
    if (existing) {
      if (!sameDefinition(existing, definition)) {
        throw new Error(`Conflicting metric definition for ${definition.name}`);
      }
      this.metrics.set(definition.name, existing);
      return existing;
    }

    const MetricClass = {
      counter: client.Counter,
      gauge: client.Gauge,
      histogram: client.Histogram,
    }[definition.type];
    if (!MetricClass) throw new Error(`Unsupported metric type: ${definition.type}`);
    const metric = new MetricClass({
      name: definition.name,
      help: definition.help || definition.name,
      labelNames: definition.labelNames,
      ...(definition.buckets ? { buckets: definition.buckets } : {}),
      registers: [this.registry],
    });
    this.metrics.set(definition.name, metric);
    return metric;
  }

  observe(name, labels, value) {
    const metric = this.metrics.get(name);
    if (!metric) throw new Error(`Metric is not registered: ${name}`);
    if (metric.type === "gauge" && Object.keys(labels).length === 0 && value === undefined) {
      metric.inc();
    } else if (metric.type === "gauge" && Object.keys(labels).length === 0) {
      metric.inc(value);
    } else if (metric.type === "histogram") {
      metric.observe(labels, value);
    } else {
      metric.inc(labels, value);
    }
  }

  set(name, labels, value) {
    const metric = this.metrics.get(name);
    if (!metric) throw new Error(`Metric is not registered: ${name}`);
    if (metric.type !== "gauge") {
      throw new Error(`Metric is not a gauge: ${name}`);
    }
    metric.set(labels, value);
  }

  async render() {
    return {
      body: await this.registry.metrics(),
      contentType: this.registry.contentType,
    };
  }
}

module.exports = { PromClientMetricsAdapter };
