const clone = (value) => JSON.parse(JSON.stringify(value));

class InMemoryMetricsAdapter {
  constructor() {
    this.definitions = new Map();
    this.observations = new Map();
  }

  registerMetric(definition) {
    const existing = this.definitions.get(definition.name);
    const normalized = clone(definition);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
      throw new Error(`Conflicting metric definition for ${definition.name}`);
    }
    this.definitions.set(definition.name, normalized);
  }

  observe(name, labels, value) {
    if (!this.observations.has(name)) this.observations.set(name, []);
    this.observations.get(name).push({ labels: clone(labels), value });
  }

  async render() {
    return { body: "", contentType: "text/plain; version=0.0.4; charset=utf-8" };
  }

  snapshot() {
    return clone(Object.fromEntries(this.observations));
  }
}

module.exports = { InMemoryMetricsAdapter };
