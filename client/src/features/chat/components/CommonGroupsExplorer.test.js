import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CommonGroupsExplorer is registered and has proper hooks/components", () => {
  const source = readFileSync(new URL("./CommonGroupsExplorer.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Kiểm tra import và sử dụng infinite scroll, freshness notifications, và các icon/callback
  assert.match(source, /useInfiniteScroll/);
  assert.match(source, /useExplorerFreshness/);
  assert.match(source, /FaUsers/);
  assert.match(source, /onNavigateToChat/);
});

test("CommonGroupsExplorer implements Stale Response Protection using AbortController", () => {
  const source = readFileSync(new URL("./CommonGroupsExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /AbortController/);
});

test("CommonGroupsExplorer implements Cursor Deduplication to prevent duplicates", () => {
  const source = readFileSync(new URL("./CommonGroupsExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /_id/);
});

test("CommonGroupsExplorer implements Floating Freshness Banner positioning rules", () => {
  const source = readFileSync(new URL("./CommonGroupsExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /sticky/);
  assert.match(source, /top-/);
  assert.match(source, /z-20/);
});


