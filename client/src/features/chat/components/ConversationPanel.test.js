import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ConversationPanel closes Common Groups modal on redirection", () => {
  const source = readFileSync(new URL("./ConversationPanel.jsx", import.meta.url), "utf8");
  assert.ok(source);
  // Kiểm tra xem click handler của CommonGroupsExplorer trong ConversationPanel có set isCommonGroupsModalOpen(false) trước khi chuyển active chat
  assert.match(source, /onNavigateToChat=\{\s*\(targetGroupId\)\s*=>\s*\{\s*setIsCommonGroupsModalOpen\(false\)/);
});
