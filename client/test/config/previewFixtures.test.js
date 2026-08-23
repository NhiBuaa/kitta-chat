import assert from "node:assert/strict";
import test from "node:test";

import { parseRuntimeConfigDocument } from "../../src/config/runtimeConfig.js";
import { getK6PreviewFixture } from "../../scripts/k6TargetConfigFixtures.mjs";

test("preview fixture catalog exposes only the locked runtime-config scenarios", () => {
  const disabled = getK6PreviewFixture("valid-disabled");
  const enabled = getK6PreviewFixture("valid-upload-enabled");

  assert.equal(disabled.kind, "json");
  assert.equal(parseRuntimeConfigDocument(disabled.document).capabilities.calls, false);
  assert.equal(parseRuntimeConfigDocument(disabled.document).capabilities.recovery, false);
  assert.equal(parseRuntimeConfigDocument(disabled.document).capabilities.upload, false);
  assert.equal(enabled.kind, "json");
  assert.equal(parseRuntimeConfigDocument(enabled.document).capabilities.upload, true);
  assert.equal(enabled.document.capabilities.recovery, false);

  assert.deepEqual(getK6PreviewFixture("missing"), { kind: "missing" });
  assert.deepEqual(getK6PreviewFixture("malformed"), {
    kind: "raw",
    body: "{malformed-json",
  });

  for (const name of ["old-version", "future-version", "wrong-target"]) {
    const fixture = getK6PreviewFixture(name);
    assert.equal(fixture.kind, "json");
    assert.throws(() => parseRuntimeConfigDocument(fixture.document));
  }

  assert.throws(
    () => getK6PreviewFixture("unknown"),
    /Unknown K6 target-config fixture/,
  );
});
