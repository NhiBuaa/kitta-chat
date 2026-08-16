const FAULT_FIXTURES = Object.freeze({
  ACKNOWLEDGEMENT_FAILURE: "acknowledgement-failure",
  ACKNOWLEDGEMENT_TIMEOUT: "acknowledgement-timeout",
  RECIPIENT_DELIVERY_TIMEOUT: "recipient-delivery-timeout",
  CORRELATION_MISMATCH: "correlation-mismatch",
});

const ALLOWED_FAULT_FIXTURES = Object.freeze(Object.values(FAULT_FIXTURES));

function normalizeFaultFixture(value) {
  if (value === undefined || value === null || value === "") return null;
  const fixture = String(value).trim();
  if (!ALLOWED_FAULT_FIXTURES.includes(fixture)) {
    throw new Error(`unsupported K4 fault fixture: ${fixture}; expected one of ${ALLOWED_FAULT_FIXTURES.join(", ")}`);
  }
  return fixture;
}

module.exports = { ALLOWED_FAULT_FIXTURES, FAULT_FIXTURES, normalizeFaultFixture };
