import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./Login.jsx", import.meta.url), "utf8");

test("Login hydrates the auth context after successful login", () => {
  assert.match(source, /window\.dispatchEvent\(new Event\("auth-changed"\)\)/);
  assert.match(source, /setStoredUser\(res\.data\.user\)/);
});

test("Login does not write the user directly to localStorage", () => {
  assert.doesNotMatch(source, /localStorage\.setItem\(["']user["']/);
});
