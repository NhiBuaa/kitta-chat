# Vertical Slices: Unified Sidebar Conversations

## Slice 1: Backend Unified Sidebar API with Cursor Pagination & Batch Queries
- **Blocked by:** None - can start immediately.
- **User stories covered:** Story 1, 2, 3, 4, 5.
- **What to build:** 
  - API endpoint `GET /api/sidebar/conversations` accepting query parameters `cursor`, `limit`, and `kind`.
  - Logic to isolate pinned conversations (only queried and prepended on page 1).
  - Query filtering for non-pinned items using `lastMessageAt` and Mongoose ObjectId (`Conversation._id`) as tie-breaker cursor.
  - Batch queries to enrich `target` details and `lastMessage.sender` details, avoiding N+1 performance pitfalls.
- **Verification:** Integration test `server/test/sidebarConversations.integration.test.js` validating:
  - Cursor pagination, kind filtering, pinned prepend, and tie-breaker sorting.
  - **Cursor Independence Test:** Verify `kind=group&cursor=null` nextCursor does not interfere when calling `kind=direct&cursor=null`. Verify incompatible cross-kind cursor calls are handled gracefully.
  - **Tie-breaker Sorting Test:** Verify 2+ conversations with identical `lastMessageAt` are traversed correctly without duplicates/omissions using ObjectId.

## Slice 2: Client Unified Sidebar Layout & Filter Chips Integration
- **Blocked by:** Slice 1.
- **User stories covered:** Story 6, 7, 8, 9, 10.
- **What to build:**
  - Replace the current segmented sidebar (Users/Groups) with a single flat list rendering the unified API response.
  - Implement Filter Chips UI ("Tất cả", "Cá nhân", "Nhóm") with independent cursor/data state partitioning.
  - Integrate `localStorage` key `kitta_sidebar_filter` to persist active tab.
  - Integrate AND logical filtering between search text and the active filter chip.
  - Design and render tab-specific Empty States with CTA buttons (e.g. "Create Group" button in Groups tab).
- **Verification:** Static unit tests in `client/src/components/layout/Sidebar.test.js` validating state reset on tab change, local storage persistence, AND search filter, and CTA render rules.

## Slice 3: Client Infinite Scroll (loadMore) Integration
- **Blocked by:** Slice 2.
- **User stories covered:** Story 11.
- **What to build:**
  - Add a Sentinel DOM element at the bottom of the unified conversations list.
  - Wire up an Intersection Observer to trigger fetch for next pages using the current active tab's independent `nextCursor`.
  - Handle merging of next-page lists in the local React state.
- **Verification:** 
  - Verify pagination logic using simulated viewport scroll events and mock API responses.
  - **Tab Switching Progress Test:** Verify that when a user is browsing tab "Nhóm" (having loaded 2 pages) and switches to tab "Cá nhân", the tab "Nhóm"'s loaded data and cursor are preserved in memory (so switching back doesn't lose progress), and tab "Cá nhân" correctly begins loading with `cursor = null`.

## Slice 4: Real-time Socket events, Debounced Sorting, and Unread Count Sync
- **Blocked by:** Slice 3.
- **User stories covered:** Story 12, 13, 14.
- **What to build:**
  - Update backend socket event emitters to package complete `target` metadata on new conversation updates.
  - Add client socket listener to update the unified conversations state dynamically on incoming messages.
  - Implement 300-500ms debounce window for UI re-sorting (reordering) while applying content updates (lastMessage) immediately.
  - Implement unread count sync: do not increment if message is from self, emit mark-as-read immediately if conversation is currently active, and increment +1 otherwise.
  - Integrate pull-to-refresh reload logic (complete replacement of the state).
- **Verification:** Integration test `client/src/features/chat/hooks/useSidebarRealtime.test.js` using fake timers to verify:
  - Debounced sorting, debounce consolidation (1 sort for 5 events), new conversation ingestion, and unread sync rules.
  - **Real-time Pagination Integration Test:** Verify that if the user has loaded 3 pages of data, and a new message arrives via socket for a conversation on page 2, the item is moved to the top: (a) it is NOT duplicated in the state, and (b) the `nextCursor` for the next page fetch remains correct despite the list reordering.
  - **Reload/Pull-to-refresh Test:** Verify that triggering reload resets the state of the active tab, replacing the entire array (including previously appended pages) with page 1 data from the API response without leaving residual items.
