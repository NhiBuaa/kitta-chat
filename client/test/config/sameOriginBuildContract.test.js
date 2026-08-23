import assert from "node:assert/strict";
import test from "node:test";

import {
  hasK6SameOriginBuildInput,
  validateK6SameOriginBuildConfig,
} from "../../src/config/sameOriginBuildContract.js";

const validBuildEnv = () => ({
  VITE_TARGET: "public-demo",
  VITE_API_URL: "/",
  VITE_API_URL_AUTH: "/api/auth",
  VITE_API_URL_USERS: "/api/users",
  VITE_API_URL_MESSAGES: "/api/messages",
  VITE_API_URL_GROUPS: "/api/groups",
  VITE_API_URL_FILES: "/api/files",
  VITE_API_URL_CALLS: "/api/calls",
});

test("K6 build contract accepts only the approved same-origin paths", () => {
  assert.deepEqual(validateK6SameOriginBuildConfig(validBuildEnv()), {
    valid: true,
    issues: [],
    values: validBuildEnv(),
  });
});

test("K6 build validation activates only for the explicit public-demo target", () => {
  assert.equal(hasK6SameOriginBuildInput({}), false);
  assert.equal(hasK6SameOriginBuildInput({ VITE_DEFAULT_AVATAR: "/avatar.svg" }), false);
  assert.equal(hasK6SameOriginBuildInput({ VITE_API_URL: "/" }), false);
  assert.equal(hasK6SameOriginBuildInput({ VITE_TARGET: "local" }), false);
  assert.equal(hasK6SameOriginBuildInput({ VITE_TARGET: "public-demo" }), true);
});

test("legacy local build variables do not opt into the K6 contract", () => {
  const legacyLocalEnvironment = {
    VITE_API_URL: "http://localhost:3000",
    VITE_API_URL_AUTH: "http://localhost:3000/api/auth",
    VITE_PROXY_TARGET: "http://localhost:3000",
    VITE_DEFAULT_AVATAR: "/avatar.svg",
  };

  assert.equal(hasK6SameOriginBuildInput(legacyLocalEnvironment), false);
});

test("K6 build contract rejects absolute, missing, and D2-bearing values", () => {
  const invalidEnvironments = [];

  for (const key of Object.keys(validBuildEnv())) {
    const missing = validBuildEnv();
    delete missing[key];
    invalidEnvironments.push(missing);
    invalidEnvironments.push({
      ...validBuildEnv(),
      [key]: "https://generated-hostname.example.test/api",
    });
  }

  invalidEnvironments.push(
    { ...validBuildEnv(), VITE_FIREBASE_API_KEY: "not-allowed" },
    { ...validBuildEnv(), VITE_PROVIDER_TOKEN: "not-allowed" },
    {
      ...validBuildEnv(),
      VITE_DEFAULT_AVATAR: "https://generated.up.railway.app/avatar/forbidden",
    },
    { ...validBuildEnv(), VITE_PROXY_TARGET: "http://backend:3000" },
    { ...validBuildEnv(), URL_FRONTEND: "https://generated-hostname.example.test" },
    { ...validBuildEnv(), CORS_ALLOWED_ORIGINS: "https://generated-hostname.example.test" },
    { ...validBuildEnv(), BACKEND_UPSTREAM: "http://backend.internal.test:3000" },
  );

  for (const env of invalidEnvironments) {
    const result = validateK6SameOriginBuildConfig(env);
    assert.equal(result.valid, false, JSON.stringify(env));
    assert.ok(result.issues.length > 0);
    assert.equal(
      Object.values(result.values).some((value) => String(value).includes("example.test")),
      false,
    );
  }
});

export { validBuildEnv };
