import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./ViewAllModalShell.jsx", import.meta.url), "utf8");

test("ViewAllModalShell ESC Blocker rule is implemented correctly", () => {
  // Verifies that the Escape listener checks for active lightbox before closing
  assert.match(source, /\.media-lightbox-active/);
  assert.match(source, /if\s*\(\s*document\.querySelector\(\s*["']\.media-lightbox-active["']\s*\)\s*\)\s*\{\s*return\s*;/);
});

test("ViewAllModalShell renders through React Portal to document.body", () => {
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
});

test("ViewAllModalShell supports dynamic size sizes normal, wide, fullscreen", () => {
  assert.match(source, /size === ["']wide["']/);
  assert.match(source, /size === ["']fullscreen["']/);
  assert.match(source, /sizeClasses/);
});
