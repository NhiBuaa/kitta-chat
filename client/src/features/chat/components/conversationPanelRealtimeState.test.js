import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshDirectCommonGroups } from "./conversationPanelRealtimeState.js";

test("refreshes direct common groups when a created group contains both users", () => {
  assert.equal(
    shouldRefreshDirectCommonGroups({
      action: "created",
      group: {
        members: [
          { _id: "user-a" },
          { _id: "user-b" },
          { _id: "user-c" },
        ],
      },
      currentUserId: "user-b",
      peerUserId: "user-a",
      panelKind: "direct",
    }),
    true,
  );
});

test("does not refresh when the created group is not common to both direct users", () => {
  assert.equal(
    shouldRefreshDirectCommonGroups({
      action: "created",
      group: { members: [{ _id: "user-b" }, { _id: "user-c" }] },
      currentUserId: "user-b",
      peerUserId: "user-a",
      panelKind: "direct",
    }),
    false,
  );
});

test("does not refresh group panels or unrelated actions", () => {
  const group = { members: ["user-a", "user-b"] };

  assert.equal(
    shouldRefreshDirectCommonGroups({
      action: "created",
      group,
      currentUserId: "user-b",
      peerUserId: "user-a",
      panelKind: "group",
    }),
    false,
  );
  assert.equal(
    shouldRefreshDirectCommonGroups({
      action: "member-added",
      group,
      currentUserId: "user-b",
      peerUserId: "user-a",
      panelKind: "direct",
    }),
    false,
  );
});
