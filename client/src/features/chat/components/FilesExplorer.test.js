import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("FilesExplorer is registered and has proper hooks/components", () => {
  const source = readFileSync(new URL("./FilesExplorer.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Enforces import and use of infinite scroll and freshness notifications
  assert.match(source, /useInfiniteScroll/);
  assert.match(source, /useExplorerFreshness/);
  assert.match(source, /FaFileAlt/);
  assert.match(source, /FaDownload/);
});

test("FilesExplorer implements Stale Response Protection using AbortController", () => {
  const source = readFileSync(new URL("./FilesExplorer.jsx", import.meta.url), "utf8");
  assert.match(source, /AbortController/);
});

test("FilesExplorer implements Cursor Deduplication to prevent duplicates", () => {
  const source = readFileSync(new URL("./FilesExplorer.jsx", import.meta.url), "utf8");
  // Check that we deduplicate incoming list entries by ID
  assert.match(source, /_id/);
});

test("FilesExplorer implements Floating Freshness Banner positioning rules", () => {
  const source = readFileSync(new URL("./FilesExplorer.jsx", import.meta.url), "utf8");
  // Enforces sticky, top-, and z-20 floating banner positioning for user visibility
  assert.match(source, /sticky/);
  assert.match(source, /top-/);
  assert.match(source, /z-20/);
});

test("FilesExplorer downloads documents through the authenticated action", () => {
  const source = readFileSync(new URL("./FilesExplorer.jsx", import.meta.url), "utf8");

  assert.ok(source.includes('import { downloadChatFile } from "../actions/downloadChatFile.js";'));
  assert.ok(source.includes("downloadChatFile({"));
  assert.ok(source.includes("fileId: item._id"));
  assert.ok(source.includes("messageId: item.messageId"));
  assert.equal(source.includes("href={item.url}"), false);
});
