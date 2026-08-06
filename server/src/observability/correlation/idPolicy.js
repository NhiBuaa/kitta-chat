const crypto = require("crypto");

const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const isValidCorrelationId = (value) =>
  typeof value === "string" && SAFE_ID_PATTERN.test(value);

const generateValidId = (generator = () => crypto.randomUUID()) => {
  try {
    const generated = generator();
    if (isValidCorrelationId(generated)) return generated;
  } catch (_error) {
    // Correlation generation must not fail a business path.
  }

  return crypto.randomUUID();
};

const canonicalizeRequestId = (incomingValue, generator) =>
  isValidCorrelationId(incomingValue)
    ? incomingValue
    : generateValidId(generator);

module.exports = {
  SAFE_ID_PATTERN,
  canonicalizeRequestId,
  generateValidId,
  isValidCorrelationId,
};
