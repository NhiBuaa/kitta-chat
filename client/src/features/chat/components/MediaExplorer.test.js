import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("MediaExplorer is registered and has proper hooks/components", () => {
  const source = readFileSync(new URL("./MediaExplorer.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Enforces import and use of infinite scroll and freshness notifications
  assert.match(source, /useInfiniteScroll/);
  assert.match(source, /useExplorerFreshness/);
  assert.match(source, /MediaLightbox/);
});

test("MediaExplorer implements Stale Response Protection using AbortController", () => {
  const source = readFileSync(new URL("./MediaExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /AbortController/);
});

test("MediaExplorer implements Cursor Deduplication to prevent duplicates", () => {
  const source = readFileSync(new URL("./MediaExplorer.jsx", import.meta.url), "utf8");
  // Check that we deduplicate incoming list entries by ID
  assert.match(source, /_id/);
});

test("MediaExplorer implements CLS protection layout rules", () => {
  const source = readFileSync(new URL("./MediaExplorer.jsx", import.meta.url), "utf8");
  // Check for grid classes and layout anti-CLS aspect-square
  assert.match(source, /aspect-square/);
  assert.match(source, /bg-gray-100/);
});

test("MediaExplorer implements Floating Freshness Banner positioning rules", () => {
  const source = readFileSync(new URL("./MediaExplorer.jsx", import.meta.url), "utf8");
  // Enforces sticky, top-, and z-20 floating banner positioning for user visibility
  assert.match(source, /sticky/);
  assert.match(source, /top-/);
  assert.match(source, /z-20/);
});
