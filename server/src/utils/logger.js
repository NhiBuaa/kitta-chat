const { getCorrelationContext } = require("../observability/correlation/asyncContext");

const SENSITIVE_FIELD_PATTERN = /(?:authorization|cookie|credential|password|secret|token|body|payload|html|raw)/i;

const sanitizeValue = (value, key = "") => {
  if (SENSITIVE_FIELD_PATTERN.test(key)) return undefined;
  if (key === "path" && typeof value === "string") return value.split("?", 1)[0];
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValue(nestedValue, nestedKey)])
        .filter(([, nestedValue]) => nestedValue !== undefined),
    );
  }
  return value;
};

const sanitizeFields = (fields = {}) => sanitizeValue(fields) || {};

const write = (level, event, fields = {}) => {
  try {
    const payload = {
      ...sanitizeFields(getCorrelationContext()),
      ...sanitizeFields(fields),
      timestamp: new Date().toISOString(),
      level,
      event,
    };
    const line = JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  } catch (_error) {
    // Observability failures must never change a business result.
  }
};

const logger = {
  info(event, fields) {
    write("info", event, fields);
  },
  warn(event, fields) {
    write("warn", event, fields);
  },
  error(event, fields) {
    write("error", event, fields);
  },
};

const logSafely = (targetLogger, level, event, fields) => {
  try {
    targetLogger?.[level]?.(event, fields);
  } catch (_error) {
    // Injected loggers follow the same best-effort contract.
  }
};

module.exports = {
  logSafely,
  logger,
  sanitizeFields,
};
