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


