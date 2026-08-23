import assert from "node:assert/strict";
import test from "node:test";

import { isLoopbackFixtureHost } from "../../src/config/loopbackFixture.js";

test("authenticated preview fixture is restricted to exact loopback hosts", () => {
  for (const hostname of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    assert.equal(isLoopbackFixtureHost(hostname), true, hostname);
  }

  for (const hostname of [
    "0.0.0.0",
    "kittachat.example.test",
    "evil.localhost.example.test",
    "127.0.0.1.example.test",
    "localhost.evil.test",
    "",
    undefined,
  ]) {
    assert.equal(isLoopbackFixtureHost(hostname), false, String(hostname));
  }
});
