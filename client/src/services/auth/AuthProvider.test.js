import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./AuthProvider.jsx", import.meta.url), "utf8");

test("AuthProvider startup does not hydrate user from stored user", () => {
  assert.doesNotMatch(source, /user:\s*getStoredUser\(\)/);
});

test("AuthProvider exposes a context method for memory user updates", () => {
  assert.match(source, /updateUser/);
  assert.match(source, /setStoredUser\(nextUser\)/);
});
