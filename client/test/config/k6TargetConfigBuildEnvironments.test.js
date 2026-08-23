import assert from "node:assert/strict";
import test from "node:test";

import {
  createK6TargetConfigBuildEnvironments,
} from "../../scripts/k6TargetConfigBuildEnvironments.mjs";

test("K6 target-config build matrix includes a real rejected public-demo build", () => {
  const matrix = createK6TargetConfigBuildEnvironments({
    PATH: "synthetic-path",
    VITE_INHERITED_VALUE: "must-not-survive",
  });

  assert.deepEqual(Object.keys(matrix), [
    "legacy",
    "rejectedPublicDemo",
    "validPublicDemo",
  ]);
  assert.equal(matrix.legacy.VITE_TARGET, undefined);
  assert.equal(matrix.legacy.VITE_INHERITED_VALUE, undefined);
  assert.equal(matrix.validPublicDemo.VITE_TARGET, "public-demo");
  assert.equal(matrix.rejectedPublicDemo.VITE_TARGET, "public-demo");
  assert.equal(
    matrix.rejectedPublicDemo.VITE_DEFAULT_AVATAR,
    "https://generated.up.railway.app/avatar/K6_FORBIDDEN_VITE_SENTINEL_111",
  );
  assert.equal(matrix.rejectedPublicDemo.VITE_PROVIDER_TOKEN, undefined);
});

test("K6 target-config build matrix preserves only approved public-demo Vite values", () => {
  const matrix = createK6TargetConfigBuildEnvironments({
    PATH: "synthetic-path",
    VITE_PROVIDER_TOKEN: "inherited-secret-like-value",
  });

  assert.deepEqual(matrix.validPublicDemo, {
    PATH: "synthetic-path",
    VITE_TARGET: "public-demo",
    VITE_API_URL: "/",
    VITE_API_URL_AUTH: "/api/auth",
    VITE_API_URL_USERS: "/api/users",
    VITE_API_URL_MESSAGES: "/api/messages",
    VITE_API_URL_GROUPS: "/api/groups",
    VITE_API_URL_FILES: "/api/files",
    VITE_API_URL_CALLS: "/api/calls",
  });
});
