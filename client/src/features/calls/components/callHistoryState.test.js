import test from "node:test";
import assert from "node:assert/strict";

import { mergeCallHistoryPage } from "./callHistoryState.js";

const call = (_id, startedAt = "2026-05-20T08:00:00.000Z") => ({
  _id,
  type: "video",
  status: "busy",
  startedAt,
});

test("reset replaces existing calls with the fetched page", () => {
  const result = mergeCallHistoryPage({
    previousCalls: [call("old-call")],
    incomingCalls: [call("new-call")],
    reset: true,
  });

  assert.deepEqual(result.map((item) => item._id), ["new-call"]);
});

test("append dedupes calls with the same _id", () => {
  const result = mergeCallHistoryPage({
    previousCalls: [call("call-1")],
    incomingCalls: [call("call-1"), call("call-2")],
    reset: false,
  });

  assert.deepEqual(result.map((item) => item._id), ["call-1", "call-2"]);
});

test("two identical first-page responses produce one item", () => {
  const firstPage = [call("call-1")];
  const afterReset = mergeCallHistoryPage({
    previousCalls: [],
    incomingCalls: firstPage,
    reset: true,
  });
  const afterDuplicateAppend = mergeCallHistoryPage({
    previousCalls: afterReset,
    incomingCalls: firstPage,
    reset: false,
  });

  assert.deepEqual(afterDuplicateAppend.map((item) => item._id), ["call-1"]);
});

test("append preserves order for new older items", () => {
  const result = mergeCallHistoryPage({
    previousCalls: [call("newest"), call("middle")],
    incomingCalls: [call("middle"), call("oldest")],
    reset: false,
  });

  assert.deepEqual(result.map((item) => item._id), ["newest", "middle", "oldest"]);
});

test("missing or null calls are handled safely", () => {
  const result = mergeCallHistoryPage({
    previousCalls: [null, call("call-1")],
    incomingCalls: [undefined, {}, call("call-1"), call("call-2")],
    reset: false,
  });

  assert.deepEqual(result.map((item) => item._id), ["call-1", "call-2"]);
});

