const assert = require("node:assert/strict");
const test = require("node:test");

const { isValidEmailFormat } = require("../src/validation/emailFormat");

test("email format validation accepts ordinary addresses within the 254-character boundary", () => {
  const domain = "example.com";
  const localPart = "a".repeat(254 - domain.length - 1);

  assert.equal(isValidEmailFormat("alice@example.com"), true);
  assert.equal(isValidEmailFormat(`${localPart}@${domain}`), true);
});

test("email format validation rejects malformed, over-limit, and ReDoS near-miss values", () => {
  const domain = "example.com";
  const tooLongLocalPart = "a".repeat(255 - domain.length - 1);
  const adversarialNearMiss = "!@!." + "!.".repeat(2048);

  assert.equal(isValidEmailFormat("alice@@example.com"), false);
  assert.equal(isValidEmailFormat(`${tooLongLocalPart}@${domain}`), false);
  assert.equal(isValidEmailFormat(adversarialNearMiss), false);
});
