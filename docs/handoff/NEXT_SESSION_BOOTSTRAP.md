# Next Session Bootstrap: Auth Migration + Group Realtime Fix

Use this file to bootstrap the next agent session for the `web-socket` repository.

## Current Completed Issue

Most recent completed implementation: **group creation realtime/sidebar metadata fix**.

Problem fixed:

- Before: group creation persisted the system message, but immediate create response and `groupUpserted` realtime payload lacked `lastMessage`, `hasUnread`, and `unreadCount`.
- Result: refresh showed correct sidebar state, but realtime sidebar state was stale/incomplete.
- Now:
  - Creator receives group sidebar payload with latest system message, `hasUnread=false`, `unreadCount=0`.
  - Invited members receive group sidebar payload with latest system message, `hasUnread=true`, `unreadCount=1`.
  - Invited members join the Socket.IO group room after receiving `groupUpserted`, so first normal group message can arrive without refresh.
  - Opening a group clears group unread state on the sidebar.

Recently completed auth migration slices:

- Issue A: centralized `authSession` wrapper.
- Issue B: backend cookie-capable `/api/auth/session`, `/api/auth/refresh`, `/api/auth/logout` while preserving Bearer JWT.
- Issue C: `AuthProvider` bootstrap from refresh/session cookie with localStorage fallback.
- Issue D: shared `axiosClient` refresh-once retry.
- Issue E: `SocketProvider` uses `AuthProvider` token state.
- Issue F0: `authSession` memory-first with localStorage fallback.
- Issue F1: `ChatPage` startup auth gates use `AuthProvider` state.
- Issue F2: `useSearch` uses `userApi`/shared `axiosClient`.
- Issue F3: friends feature uses `friendApi`/shared `axiosClient`.
- Issue F4: group JSON REST flows use `groupApi`/shared `axiosClient`.

## Current Bug / Issue In Progress

No active implementation is intentionally left half-finished.

Recommended next work is a **manual verification / diagnose pass** for the group creation realtime fix, because code/tests pass but the user-reported behavior needs browser/manual confirmation with two accounts.

Potential follow-up if manual verification passes:

- Plan the next auth migration slice for profile or file/upload.
- Prefer profile before upload/call if continuing auth migration.
- Defer call service and upload/file clients because they have higher lifecycle/multipart risk.

## Files Changed In Current Working Tree

Current changed files include both the F4 auth migration and the group realtime/sidebar fix:

- `client/src/services/api/groupApi.js`
  - Added `createGroup`, `addGroupMember`, `removeGroupMember`, `transferGroupAdmin`, `deleteGroup` wrappers via shared `axiosClient`.
- `client/src/features/groups/components/CreateGroupModal.jsx`
  - Uses `createGroup()` instead of raw axios/token header.
- `client/src/features/groups/components/AddMemberModal.jsx`
  - Uses `getFriends()` and `addGroupMember()` instead of raw axios/token header.
- `client/src/features/groups/components/GroupMembersModal.jsx`
  - Uses `removeGroupMember()`, `transferGroupAdmin()`, `deleteGroup()` instead of raw axios/token header.
- `client/src/features/groups/socket/useGroupSocket.js`
  - Emits `joinGroup` when current user receives `groupUpserted` for a group they belong to.
- `client/src/features/chat/hooks/useChatMessages.js`
  - Accepts `setGroups`; clears group unread state when a group chat is opened.
- `client/src/features/chat/pages/ChatPage.jsx`
  - Passes `setGroups` into `useChatMessages`.
- `client/src/features/chat/socket/useMessageSocket.js`
  - Clears group sidebar unread state when current user read event arrives.
- `server/src/controllers/groupController.js`
  - Builds sidebar-ready group payload for create response and per-member `groupUpserted` emits.
- `server/src/controllers/messageController.js`
  - `createSystemMessage(groupId, text, options)` supports optional `readBy`.
- `server/test/groupController.test.js`
  - Added regression test for creator/invited group creation sidebar metadata.

Also note:

- `.codegraph/` is untracked. Do not touch unless the user asks.
- Git may warn that LF will be replaced by CRLF on Windows; this was already observed during `git diff`.

## Tests / Manual Tests Already Passed

Automated checks passed after the group realtime/sidebar fix:

```powershell
cd server
npm.cmd test -- test/groupController.test.js
```

Result: `5/5` group controller tests passed.

```powershell
cd server
npm.cmd test
```

Result: `165/165` server tests passed.

```powershell
cd client
npm.cmd test
```

Result: `95/95` client tests passed.

```powershell
cd client
npm.cmd run build
```

Result: build passed.

Known build warning:

- Vite still warns that one chunk is larger than 500 kB. This is existing/non-blocking and unrelated.

Manual tests still recommended, not yet confirmed in browser after latest fix:

1. A creates group with B/C.
2. A immediately sees group sidebar latest message: `A đã tạo nhóm`, not bold, no unread badge.
3. B/C immediately see new group with latest message: `A đã tạo nhóm`, bold, unread badge `1`.
4. B opens the group; unread badge clears.
5. A sends first normal group message; B/C receive it without refresh.
6. Refresh A/B/C; sidebar state matches realtime state.

## Risks / Caveats

- The backend now persists creator read state for the create-group system message via `readBy: [adminId]`.
- `createSystemMessage` now accepts optional `readBy`; existing callers keep default `[]` behavior.
- Group creation emits `groupUpserted` per member instead of one shared payload, because unread state is user-specific.
- Client joins group room on `groupUpserted`; this is intentional for newly created/added groups so future group messages arrive without refresh.
- `useChatMessages` now clears group unread state when opening group chats; this aligns with existing `markRead` behavior.
- There is no browser/E2E test for multi-account realtime group creation yet, so manual verification is important.
- Do not remove localStorage token persistence yet. Remaining higher-risk auth readers still exist in profile/upload/file/call areas.
- Defer `callService` migration: it has active-call lifecycle and hard `401 -> clear token -> /login` behavior.
- Defer upload/file migration: multipart and presigned S3 PUT flows are higher risk than JSON REST calls.

## Exact Next Recommended Skill

Use **`diagnose`** next.

Reason: the next safest step is to manually verify and diagnose the just-fixed realtime group creation behavior with two accounts before starting another migration slice.

## Exact Next Prompt

```text
Use the diagnose skill.

Verify the group creation realtime/sidebar fix manually and from code if needed.

Context:
- The backend now returns sidebar-ready group payloads on createGroup.
- Creator should receive lastMessage "A đã tạo nhóm", hasUnread=false, unreadCount=0.
- Invited members should receive the same lastMessage, hasUnread=true, unreadCount=1.
- Client useGroupSocket now emits joinGroup on groupUpserted for current user's memberships.
- useChatMessages now clears group unread state when opening a group.

Manual verification goals:
1. A creates group with B/C.
2. A immediately sees latest message "A đã tạo nhóm", not bold, no unread badge.
3. B/C immediately see the group, latest message "A đã tạo nhóm", bold, badge 1.
4. B opens group; badge clears.
5. A sends first normal group message; B/C receive it without refresh.
6. Refresh A/B/C; sidebar state matches realtime state.

If manual verification fails:
- Diagnose root cause first.
- Do not refactor broadly.
- Propose the smallest safe fix.

If manual verification passes:
- Recommend the next smallest auth migration slice.

Do not modify files unless a reproducible failure is found and the smallest safe fix is clear.
```

## Do Not Change Casually

- Do not use RabbitMQ for realtime chat/call delivery.
- Do not remove MongoDB as source of truth.
- Do not remove localStorage token persistence yet.
- Do not change backend Socket.IO auth to cookie auth yet.
- Do not refactor call lifecycle broadly.
- Do not remove `idempotencyKey` behavior from message send.
- Do not change normal group message unread semantics while verifying group creation.
- Do not touch `.codegraph/` unless requested.
