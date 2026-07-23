import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("chat header identity button does not show a border or focus ring after opening the conversation panel", () => {
  const source = readFileSync(new URL("./ChatWindow.jsx", import.meta.url), "utf8");
  const typeIndex = source.indexOf('type="button"');
  const buttonStart = source.lastIndexOf("<button", typeIndex);
  const buttonEnd = source.indexOf("</button>", typeIndex);
  const identityButtonSource = source.slice(buttonStart, buttonEnd);

  assert.ok(buttonStart >= 0 && buttonEnd > buttonStart);
  assert.ok(identityButtonSource.includes("border-0"));
  assert.ok(identityButtonSource.includes("focus:outline-none"));
  assert.ok(identityButtonSource.includes("focus:ring-0"));
  assert.ok(identityButtonSource.includes("focus-visible:bg-gray-100"));
  assert.doesNotMatch(identityButtonSource, /focus:ring-[1-9]/);
});

test("chat scroll container reports genuine user scroll intent separately from scroll position", () => {
  const source = readFileSync(new URL("./ChatWindow.jsx", import.meta.url), "utf8");
  const containerStart = source.indexOf('ref={scrollRef}');
  const containerEnd = source.indexOf('>', containerStart);
  const scrollContainerSource = source.slice(containerStart, containerEnd);

  assert.ok(containerStart >= 0 && containerEnd > containerStart);
  assert.ok(scrollContainerSource.includes('onWheel={handleScrollWheel}'));
  assert.ok(scrollContainerSource.includes('onTouchStart={handleScrollTouchStart}'));
  assert.ok(scrollContainerSource.includes('onTouchMove={handleScrollTouchMove}'));
  assert.ok(scrollContainerSource.includes('onPointerDown={handleScrollPointerDown}'));
});
