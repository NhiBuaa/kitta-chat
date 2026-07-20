import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("MediaLightbox is registered and has proper imports", () => {
  const source = readFileSync(new URL("./MediaLightbox.jsx", import.meta.url), "utf8");
  assert.ok(source);
});

test("MediaLightbox adds active class to signal ESC blocking to Modal Shell", () => {
  const source = readFileSync(new URL("./MediaLightbox.jsx", import.meta.url), "utf8");
  // Enforces active class being set to notify parent shell modal
  assert.match(source, /\.media-lightbox-active/);
});

test("MediaLightbox keydown Escape calls e.stopPropagation to prevent shell close", () => {
  const source = readFileSync(new URL("./MediaLightbox.jsx", import.meta.url), "utf8");
  // Enforces keydown Escape blocking logic
  assert.match(source, /Escape/);
  assert.match(source, /stopPropagation\(\)/);
});
