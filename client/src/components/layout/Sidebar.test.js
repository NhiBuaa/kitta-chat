import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Sidebar.jsx renders 3 filter chips 'Tất cả', 'Cá nhân', 'Nhóm'", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");
  assert.match(source, /Tất cả/);
  assert.match(source, /Cá nhân/);
  assert.match(source, /Nhóm/);
});

test("Sidebar.jsx implements online state check correctly (only uses active state)", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");
  
  // Verify it checks target.isOnline or activityStatus state === "active"
  // And it must NOT look for the state === "online" since ADR only allows "active"
  assert.match(source, /isOnline|activityStatus\?\.state\s*===\s*["']active["']/);
  assert.doesNotMatch(source, /activityStatus\?\.state\s*===\s*["']online["']/);
});

test("Sidebar.jsx supports customized Empty States for All, Direct, and Group tabs", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // Verify the empty state texts exist in the code
  assert.match(source, /Không có cuộc trò chuyện nào|Chưa có cuộc trò chuyện cá nhân|Bạn chưa tham gia nhóm chat nào/);
  assert.match(source, /Không tìm thấy kết quả nào|Không tìm thấy kết quả cá nhân nào|Không tìm thấy nhóm nào/);
});

test("Sidebar.jsx renders Create Group CTA button in Group Empty State", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // Verify that the create group CTA calls setShowCreateGroup or is mapped correctly
  assert.match(source, /setShowCreateGroup/);
  assert.match(source, /Tạo nhóm mới/);
});

// ──────────── REGRESSION TESTS FOR SIDEBAR BUGS ────────────

test("[BUG-A] Sidebar.jsx renderSubtitle must not produce leading colon when senderName is empty", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");
  
  // The renderSubtitle function for group must guard against empty senderName.
  // Pattern "${senderName}: ${content}" produces ": content" when senderName is "".
  // Fix: must check senderName before prepending "Name: " prefix.
  // Verify the source contains a guard checking senderName existence before template string concat
  assert.match(
    source,
    /senderName.*\?|lastMessage\.senderName\s*&&|senderName\s*\?\s*`\$\{|senderName\s*!==\s*["']["']/,
    "renderSubtitle must guard against empty senderName to avoid leading colon ':'"
  );
});

test("[BUG-B] Sidebar.jsx must display lastMessage.content for direct chat subtitle", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");
  
  // The subtitle for direct chat must render lastMessage.content
  // Verify the pattern: for kind !== "group", render conv.lastMessage.content
  assert.match(
    source,
    /lastMessage\.content/,
    "Sidebar must access lastMessage.content to display direct chat subtitle"
  );
});

test("[BUG-C] Sidebar.jsx must pass handleSelectUser-compatible object with _id and members", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // handleSelectUser in ChatPage expects user._id (top-level) and user.members (for groups).
  // API returns { conversationId, target: { _id, ... }, kind, ... }
  // Sidebar must transform conv into handleSelectUser-compatible shape.
  
  // Check 1: An object mapping _id from conv.target._id must exist
  assert.match(
    source,
    /_id:\s*conv\.target\?\._id/,
    "Sidebar must map conv.target._id to a top-level _id property"
  );

  // Check 2: handleSelectUser must NOT be called with raw conv
  assert.doesNotMatch(
    source,
    /handleSelectUser\(\s*conv\s*\)/,
    "Sidebar must NOT pass raw conv directly to handleSelectUser"
  );
});

test("[BUG-D] sidebarController must use Group model field 'name' not 'displayName'", () => {
  const source = readFileSync(
    new URL("../../../../server/src/controllers/sidebarController.js", import.meta.url),
    "utf8"
  );

  // Group model has field "name", not "displayName".
  // The select() call must include "name" and the target mapping must use g.name
  assert.match(
    source,
    /\.select\([^)]*\bname\b/,
    "Group.find().select() must include 'name' field (Group model uses 'name', not 'displayName')"
  );
  assert.match(
    source,
    /displayName:\s*g\.name/,
    "Group target.displayName must be mapped from g.name"
  );
});

test("[BUG-E] Sidebar selectPayload must pass members as array from API, not boolean true", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // ChatWindow.jsx expects members.length, members.find(), members.some()
  // selectPayload must use conv.target?.members (array from API), not `members: true` (boolean)
  assert.doesNotMatch(
    source,
    /members:\s*true/,
    "selectPayload must NOT set members to boolean true — ChatWindow expects an array"
  );
  assert.match(
    source,
    /members:\s*conv\.target\?\.members/,
    "selectPayload must pass members array from conv.target.members"
  );
});

test("[BUG-FLASH] Sidebar.jsx must check isSearching/loading state before rendering empty state to prevent UI flashing on tab switch", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // Verify that conversation list section checks isSearching before falling back to renderEmptyState()
  // Pattern: isSearching ? ( ... skeleton ... ) : renderEmptyState() or similar
  assert.match(
    source,
    /isSearching\s*\?\s*\(\s*renderSkeletonLoader\(\)\s*\)\s*:\s*\(\s*renderEmptyState\(\)\s*\)|isSearching\s*\?\s*renderSkeletonLoader\(\)\s*:\s*renderEmptyState\(\)/,
    "Sidebar.jsx must render skeleton loading when isSearching is true instead of directly calling renderEmptyState()"
  );
});

// ──────────── SLICE 3: INFINITE SCROLL INTEGRATION TESTS ────────────

test("Sidebar.jsx imports and uses useInfiniteScroll hook for Sentinel Node", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  assert.match(
    source,
    /import.*useInfiniteScroll.*from/,
    "Sidebar.jsx must import useInfiniteScroll hook"
  );
  assert.match(
    source,
    /useInfiniteScroll\s*\(/,
    "Sidebar.jsx must invoke useInfiniteScroll hook"
  );
  assert.match(
    source,
    /ref=\{\s*sentinelRef\s*\}/,
    "Sidebar.jsx must attach sentinelRef to a Sentinel DOM element"
  );
});

test("Sidebar.jsx renders a bottom loading spinner when isFetching is true and list is not empty", () => {
  const source = readFileSync(new URL("./Sidebar.jsx", import.meta.url), "utf8");

  // Check for rendering bottom loading spinner when fetching page > 1
  assert.match(
    source,
    /isFetching.*animate-spin|isFetching\s*&&.*Loading/s,
    "Sidebar.jsx must render loading indicator when isFetching is true during loadMore"
  );
});

test("ChatPage.jsx passes onLoadMore, hasMore, and isFetching props to Sidebar component", () => {
  const source = readFileSync(
    new URL("../../features/chat/pages/ChatPage.jsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /onLoadMore=\{\s*sidebarState\.onLoadMore\s*\}/,
    "ChatPage.jsx must pass onLoadMore prop to Sidebar"
  );
  assert.match(
    source,
    /hasMore=\{\s*sidebarState\.hasMore\s*\}/,
    "ChatPage.jsx must pass hasMore prop to Sidebar"
  );
  assert.match(
    source,
    /isFetching=\{\s*sidebarState\.isFetching\s*\}/,
    "ChatPage.jsx must pass isFetching prop to Sidebar"
  );
});


