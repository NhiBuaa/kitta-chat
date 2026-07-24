# PRD: Unified Sidebar Conversations

## Problem Statement

Hiện tại, hệ thống KittaChat đang tách biệt danh sách trò chuyện 1-1 (tin nhắn cá nhân) và nhóm chat thành hai mục hiển thị riêng biệt trên Sidebar. Điều này gây khó khăn cho người dùng trong việc theo dõi luồng hội thoại theo thời gian thực (không biết cuộc hội thoại nào mới nhất nếu nhóm chat và direct chat nhận tin nhắn xen kẽ nhau). 
Đồng thời, việc gộp danh sách ở client-side trên dữ liệu không phân trang sẽ gây ra lỗi nghiêm trọng về tính đúng đắn khi số lượng cuộc trò chuyện vượt quá giới hạn (limit) của một trang.

## Solution

Gộp danh sách nhóm chat và chat cá nhân thành một danh sách hội thoại duy nhất ("Tin nhắn") hiển thị phẳng trên Sidebar. Toàn bộ danh sách này được phân trang bằng Cursor-based pagination ở backend, hỗ trợ các tab bộ lọc nhanh ("Tất cả", "Cá nhân", "Nhóm") để người dùng chuyển đổi phạm vi hiển thị tức thì.

## User Stories

1. As a chat user, I want to see direct chats and group chats merged into a single flat list, so that I can easily track all my conversations in chronological order.
2. As a chat user, I want to see my pinned conversations always at the top of the first page, so that I can quickly access my most important contacts.
3. As a chat user, I want the conversations to be sorted by the timestamp of their last message descending, so that the most active chats are immediately visible.
4. As a chat user, I want to see the sender's display name and avatar prefixing the message content in group chats (e.g., "An: Hẹn 3h nhé"), so that I can immediately know who sent the message.
5. As a chat user, I want to see appropriate fallback texts (such as member count for groups and status text for users) when a conversation has no messages, so that the sidebar is informative even for new chats.
6. As a chat user, I want to filter the conversations by "Tất cả", "Cá nhân", or "Nhóm" using interactive filter chips, so that I can narrow down my search scope.
7. As a chat user, I want my selected filter chip preference to persist across app reloads, so that the app opens in my preferred view.
8. As a chat user, I want to search through my conversations, so that I can find a specific person or group chat by display name.
9. As a chat user, I want the search input to filter within the currently active filter chip tab (AND logic), so that the search results respect my chosen scope.
10. As a chat user, I want to see specific Empty State layouts and texts tailored to each filter tab when no matches are found, so that I have clear guidance on what to do next (such as a "Create Group" CTA in the Groups tab).
11. As a chat user, I want to load more conversations automatically when I scroll to the bottom of the sidebar (infinite scroll), so that I can browse all my history without performance issues.
12. As a chat user, I want my conversations to jump to the top of the list in real-time when new messages arrive, so that I don't miss new incoming activity.
13. As a chat user, I want the real-time sorting to be debounced, so that the UI doesn't flicker or jump disorientingly when receiving many rapid updates.
14. As a chat user, I want my unread badge counters on the sidebar to sync correctly when conversations receive messages in the background or are marked as read.

## Implementation Decisions

### 1. Backend Route & Query
- **Endpoint:** `GET /api/sidebar/conversations`
- **Query Parameters:**
  - `cursor`: String, format `<lastMessageAt>_<conversationId>` (Tie-breaker is the ObjectId of the `Conversation` in read-model).
  - `limit`: Number, defaults to 20.
  - `kind`: String, optional (`direct` | `group`), filters conversations by type before applying pagination.
- **Pinned Handling:**
  - When `cursor` is null (page 1), backend queries all pinned conversations of the user and prepends them to the first page: `[...pinned, ...nonPinned]`.
  - When `cursor` is not null (pages > 1), backend only queries non-pinned conversations matching the cursor.
- **Batch Query & N+1 Prevention:**
  - Backend retrieves candidates using `getSidebarCandidatesForUser`.
  - Gathers target IDs (userIds for direct, groupIds for groups) and sender IDs from last messages.
  - Executes exactly two batch queries (`User.find` and `Group.find` with `$in`) to populate the `target` details and `lastMessage.sender` info.

### 2. Client Sidebar State & Filter
- **Filter Chips:**
  - Component renders 3 buttons: "Tất cả", "Cá nhân" (sends `kind=direct`), and "Nhóm" (sends `kind=group`).
  - Lọc AND: Search input filters the active list locally, or triggers a search query if backend search is needed.
  - Local Storage: Active tab ID is saved to `localStorage` key `kitta_sidebar_filter`.
- **State Partitioning:**
  - Client manages cursor, list data, and pagination states (`hasMore`, `nextCursor`) **independently** for each tab filter. Changing tabs resets the target tab's cursor to null and reloads it.

### 3. Real-time Socket & Debouncing
- **Socket Event updates:**
  - Receives `getMessage` event. Client updates the conversation `lastMessage` and `lastMessageAt` in local state.
  - Debounce: Client uses a 300-500ms debounce timer for the *sorting* logic (reordering position), while *data* updates (message content) are applied instantly.
  - Multi-tab sync: If `senderId === currentUserId`, `unreadCount` is not incremented.

## Testing Decisions

### Test Seams
1. **Backend Integration Seam (`server/test/sidebarConversations.integration.test.js`):**
   - Testing endpoint `GET /api/sidebar/conversations` with integration tests on MongoDB memory store.
   - Verification covers:
     - **Cursor Independence:** 
       1. Call `kind=group&cursor=null` to get `nextCursor_A`.
       2. Call `kind=direct&cursor=null` and verify it returns correct first page of direct conversations, unaffected by the group cursor state.
       3. Call `kind=direct&cursor=nextCursor_A` and verify it handles incompatible cross-kind cursors gracefully without returning corrupted or offset data.
     - **Tie-breaker Sorting:** Create 2+ conversations with identical `lastMessageAt` timestamps. Verify that the cursor-based pagination traverses them correctly using the ObjectId tie-breaker without duplicates or omissions across pages.
     - **Pinned Isolation & Batch Queries:** Correct prepending of pinned items on page 1, distinct from subsequent pages, and verify batch query efficiency (preventing N+1 queries).

2. **Client Component Seam (`client/src/components/layout/Sidebar.test.js`):**
   - Static file parsing and unit/hook tests in the client.
   - Verification covers:
     - State management for independent tab cursors.
     - Search and filter chip AND logical interaction.
     - Local storage active filter chip preference persistence (`kitta_sidebar_filter`).
     - Render rules of specialized Empty States for each tab, including the CTA button to create a new group in the Groups empty state.

3. **Client Real-time/Socket Seam (`client/src/features/chat/hooks/useSidebarRealtime.test.js`):**
   - Verification covers the complex real-time behavior:
     - **Debounced Sorting Behavior:** A new incoming message updates the conversation `lastMessage` and `lastMessageAt` fields immediately. However, the item's physical list index remains unchanged until the 300-500ms debounce timer fires (verified using fake timers).
     - **Debounce Consolidation:** 5 rapid message events from different conversations received within 200ms must only trigger exactly 1 re-sort/re-render action after the debounce window expires.
     - **New Conversation Ingestion:** A message received from a conversation not currently present in the list stages a new item containing the complete, backend-enriched `target` fields (displayName, avatar, etc.) without missing metadata.
     - **Unread Sync & Multi-tab Sync:**
       1. If `senderId === currentUserId`, `unreadCount` must not increment.
       2. If `activeChat._id === conversationId`, `unreadCount` must not increment, and a `mark-as-read` event must be emitted immediately to the backend.
       3. If `activeChat._id !== conversationId`, `unreadCount` increments by 1.

### Prior Art
- `server/test/conversationPanel.integration.test.js` for read-model querying and panel endpoints.
- `client/src/features/chat/components/CommonGroupsExplorer.test.js` for client-side infinite scroll logic and stale protection.

## Out of Scope
- Separate unread notification badges count for each individual Filter Chip (only the global unread count on the application icon/sidebar header is supported in version 1).
- Custom grouping or folder structures inside the unified list.
