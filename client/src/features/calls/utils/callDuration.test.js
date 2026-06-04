import test from "node:test";
import assert from "node:assert/strict";

import { getCallDurationSeconds, getDelayToNextDurationTick, getPopupDurationSeconds } from "./callDuration.js";

test("getCallDurationSeconds returns elapsed seconds from answeredAt", () => {
  assert.equal(getCallDurationSeconds({
    answeredAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:10.000Z"),
  }), 10);
});

test("getCallDurationSeconds returns 0 when answeredAt is missing", () => {
  assert.equal(getCallDurationSeconds({ answeredAt: null, now: new Date("2026-01-01T08:00:10.000Z") }), 0);
  assert.equal(getCallDurationSeconds({ now: new Date("2026-01-01T08:00:10.000Z") }), 0);
});

test("getCallDurationSeconds returns 0 when answeredAt is invalid", () => {
  assert.equal(getCallDurationSeconds({ answeredAt: "not-a-date", now: new Date("2026-01-01T08:00:10.000Z") }), 0);
});

test("getCallDurationSeconds never returns negative duration", () => {
  assert.equal(getCallDurationSeconds({
    answeredAt: "2026-01-01T08:00:10.000Z",
    now: new Date("2026-01-01T08:00:00.000Z"),
  }), 0);
});

test("getCallDurationSeconds floors partial seconds", () => {
  assert.equal(getCallDurationSeconds({
    answeredAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:10.999Z"),
  }), 10);
});

test("getDelayToNextDurationTick returns delay until next elapsed second boundary", () => {
  assert.equal(getDelayToNextDurationTick({
    answeredAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:10.250Z"),
  }), 750);
});

test("getDelayToNextDurationTick uses full delay at exact second boundary", () => {
  assert.equal(getDelayToNextDurationTick({
    answeredAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:10.000Z"),
  }), 1000);
});

test("getDelayToNextDurationTick handles missing, invalid, and future answeredAt safely", () => {
  const now = new Date("2026-01-01T08:00:10.000Z");

  assert.equal(getDelayToNextDurationTick({ answeredAt: null, now }), 1000);
  assert.equal(getDelayToNextDurationTick({ answeredAt: "not-a-date", now }), 1000);
  assert.equal(getDelayToNextDurationTick({
    answeredAt: "2026-01-01T08:00:12.000Z",
    now,
  }), 1000);
});
test("getPopupDurationSeconds returns 0 immediately from displayStartedAt", () => {
  assert.equal(getPopupDurationSeconds({
    displayStartedAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:00.999Z"),
  }), 0);
});

test("getPopupDurationSeconds returns elapsed UX seconds from displayStartedAt", () => {
  assert.equal(getPopupDurationSeconds({
    displayStartedAt: "2026-01-01T08:00:00.000Z",
    now: new Date("2026-01-01T08:00:01.000Z"),
  }), 1);
});

test("getPopupDurationSeconds returns 0 for missing, invalid, or future displayStartedAt", () => {
  const now = new Date("2026-01-01T08:00:00.000Z");

  assert.equal(getPopupDurationSeconds({ displayStartedAt: null, now }), 0);
  assert.equal(getPopupDurationSeconds({ displayStartedAt: "not-a-date", now }), 0);
  assert.equal(getPopupDurationSeconds({
    displayStartedAt: "2026-01-01T08:00:01.000Z",
    now,
  }), 0);
});