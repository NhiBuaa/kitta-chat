import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ConversationPanel closes Common Groups modal on redirection", () => {
  const source = readFileSync(new URL("./ConversationPanel.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Kiểm tra xem click handler của CommonGroupsExplorer trong ConversationPanel có set isCommonGroupsModalOpen(false) trước khi chuyển active chat
  assert.match(source, /onNavigateToChat=\{\s*\(targetGroupId\)\s*=>\s*\{\s*setIsCommonGroupsModalOpen\(false\)/);
});

test("ConversationPanel slices resources to exact preview limits (media: 6, files: 3, links: 3, commonGroups: 3, membersPreview: 5)", () => {
  const source = readFileSync(new URL("./ConversationPanel.jsx", import.meta.url), "utf8");
  assert.ok(source);
  assert.match(source, /mediaState\.items\.slice\(0,\s*6\)/);
  assert.match(source, /filesState\.items\.slice\(0,\s*3\)/);
  assert.match(source, /linksState\.items\.slice\(0,\s*3\)/);
  assert.match(source, /membershipState\.commonGroups\.slice\(0,\s*3\)/);
  assert.match(source, /membershipState\.membersPreview\.slice\(0,\s*5\)/);
});




test("ConversationPanel wires created common-group events to membership refresh", () => {
  const source = readFileSync(new URL("./ConversationPanel.jsx", import.meta.url), "utf8");

  assert.ok(
    source.includes('payload?.action === "created" && shouldRefreshDirectCommonGroups({'),
  );
  assert.ok(source.includes("currentUserId: currentUser?._id"));
  assert.ok(source.includes("peerUserId: currentChatUser?._id"));
  const handlerStart = source.indexOf("const handleSocketGroupUpserted");
  const handlerEnd = source.indexOf('socket.on("groupRenamed"', handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);
  assert.ok(handlerSource.includes("if (shouldRefreshCommonGroups) {"));
  assert.ok(handlerSource.includes("fetchMembership();"));
});
