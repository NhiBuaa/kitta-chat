const { AsyncLocalStorage } = require("node:async_hooks");

const correlationStorage = new AsyncLocalStorage();

const getCorrelationContext = () => correlationStorage.getStore() || {};

const runWithCorrelationContext = (context, callback) =>
  correlationStorage.run({ ...getCorrelationContext(), ...context }, callback);

module.exports = {
  getCorrelationContext,
  runWithCorrelationContext,
};
