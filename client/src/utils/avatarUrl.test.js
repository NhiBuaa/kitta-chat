import assert from "node:assert/strict";
import test from "node:test";

import { resolveAvatarUrl } from "./avatarUrl.js";

test("resolveAvatarUrl preserves browser-ready and app-static URLs", () => {
  assert.equal(resolveAvatarUrl("https://cdn.example/avatar.webp"), "https://cdn.example/avatar.webp");
  assert.equal(resolveAvatarUrl("blob:http://localhost/avatar"), "blob:http://localhost/avatar");
  assert.equal(resolveAvatarUrl("data:image/svg+xml;base64,abc"), "data:image/svg+xml;base64,abc");
  assert.equal(resolveAvatarUrl("/demo-assets/avatars/alice.svg"), "/demo-assets/avatars/alice.svg");
  assert.equal(resolveAvatarUrl("/uploads/avatar.webp"), "/uploads/avatar.webp");
});

test("resolveAvatarUrl keeps legacy avatar resolution configurable", () => {
  assert.equal(resolveAvatarUrl("avatars/alice.webp"), "/uploads/avatars/alice.webp");
  assert.equal(
    resolveAvatarUrl("avatars/alice.webp", { legacyBaseUrl: "/api/users" }),
    "/api/users/avatars/alice.webp",
  );
  assert.equal(
    resolveAvatarUrl(null, { defaultAvatar: "/default-avatar.svg" }),
    "/default-avatar.svg",
  );
});
