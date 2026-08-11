import assert from "node:assert/strict";
import test from "node:test";

import { isValidDisplayName } from "./displayName.js";

test("display-name validation preserves intended Latin and Vietnamese names", () => {
  assert.equal(isValidDisplayName("An"), true);
  assert.equal(isValidDisplayName("Nguyễn Thị Ánh"), true);
  assert.equal(isValidDisplayName("Đặng Văn Sáng"), true);
});

test("display-name validation keeps the existing character and length boundaries", () => {
  assert.equal(isValidDisplayName("A"), false);
  assert.equal(isValidDisplayName("A".repeat(31)), false);
  assert.equal(isValidDisplayName("A".repeat(30)), true);
  assert.equal(isValidDisplayName("Nguyễn-Văn"), false);
  assert.equal(isValidDisplayName("李雷"), false);
  assert.equal(isValidDisplayName("   "), false);
});
