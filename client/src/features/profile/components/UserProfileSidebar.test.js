import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./UserProfileSidebar.jsx", import.meta.url), "utf8");

test("UserProfileSidebar updates AuthProvider context instead of auth storage directly", () => {
  assert.match(source, /useAuth\(\)/);
  assert.match(source, /updateUser\(res\.data\.user\)/);
  assert.doesNotMatch(source, /setStoredUser/);
});

test("UserProfileSidebar does not write the user directly to localStorage", () => {
  assert.doesNotMatch(source, /localStorage\.setItem\(["']user["']/);
});
