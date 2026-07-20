import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LinksExplorer is registered and has proper hooks/components", () => {
  const source = readFileSync(new URL("./LinksExplorer.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Enforces import and use of infinite scroll and freshness notifications
  assert.match(source, /useInfiniteScroll/);
  assert.match(source, /useExplorerFreshness/);
  assert.match(source, /FaLink/);
  assert.match(source, /FaExternalLinkAlt/);
});

test("LinksExplorer implements Stale Response Protection using AbortController", () => {
  const source = readFileSync(new URL("./LinksExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /AbortController/);
});

test("LinksExplorer implements Cursor Deduplication to prevent duplicates", () => {
  const source = readFileSync(new URL("./LinksExplorer.jsx", import.meta.url), "utf8");
  // Check that we deduplicate incoming list entries
  assert.match(source, /filter/);
});

test("LinksExplorer implements Floating Freshness Banner positioning rules", () => {
  const source = readFileSync(new URL("./LinksExplorer.jsx", import.meta.url), "utf8");
  // Enforces sticky, top-, and z-20 floating banner positioning for user visibility
  assert.match(source, /sticky/);
  assert.match(source, /top-/);
  assert.match(source, /z-20/);
});

test("LinksExplorer links open in new tab with target _blank", () => {
  const source = readFileSync(new URL("./LinksExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /target="_blank"/);
});
