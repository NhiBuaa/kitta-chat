import assert from "node:assert/strict";
import test from "node:test";
import {
  getRealtimePanelResourceScopes,
  shouldRefreshDirectCommonGroups,
} from "./conversationPanelRealtimeState.js";

test("returns media scope for a new image in the open direct conversation", () => {
  assert.deepEqual(
    getRealtimePanelResourceScopes({
      message: {
        senderId: "user-a",
        receiverId: "user-b",
        attachments: [{ mimeType: "image/jpeg" }],
      },
      conversationId: "user-a_user-b",
      currentUserId: "user-b",
    }),
    ["media"],
  );
});

test("returns every affected resource scope for a mixed message", () => {
  assert.deepEqual(
    getRealtimePanelResourceScopes({
      message: {
        conversationId: "group-1",
        isGroup: true,
        receiverId: "group-1",
        text: "Xem thêm https://example.com",
        attachmentsData: [
          { mimeType: "video/mp4" },
          { mimeType: "application/pdf" },
        ],
      },
      conversationId: "group-1",
      currentUserId: "user-b",
    }),
    ["media", "files", "links"],
  );
});

test("ignores resource messages from another conversation", () => {
  assert.deepEqual(
    getRealtimePanelResourceScopes({
      message: {
        senderId: "user-c",
        receiverId: "user-d",
        image: "https://example.com/image.jpg",
      },
      conversationId: "user-a_user-b",
      currentUserId: "user-b",
    }),
    [],
  );
});

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
