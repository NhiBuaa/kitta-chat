# Conversation Read Model Migration — Current Session Roadmap

## Mục tiêu tổng thể

Triển khai Conversation Read Model theo từng slice nhỏ, có kiểm chứng, trong khi runtime legacy vẫn an toàn.

Các invariant bắt buộc:

- MongoDB là source of truth.
- `Message.conversationId` vẫn là public/socket/cache bridge.
- `Conversation._id` chỉ dùng nội bộ backend, không expose ra client.
- Redis chỉ là cache/coordination, không phải source of truth.
- RabbitMQ vẫn background-only.
- Sidebar/search chỉ được switch sau khi có shadow compare và reconciliation đủ tin cậy.
- Không đổi Socket.IO payloads/rooms nếu chưa có slice riêng được duyệt.

## Trạng thái runtime hiện tại

- Runtime vẫn legacy-authoritative.
- Direct sidebar vẫn đọc legacy flow từ Redis ZSET + `Message.aggregate` + `User.friends`.
- Group sidebar vẫn đọc legacy flow từ `Group.members` + `Message.aggregate`.
- Search vẫn legacy.
- Dual-write socket message đã có nhưng disabled by default qua `CONVERSATION_DUAL_WRITE_ENABLED=false`.
- Manual Docker verification đã confirm khi bật flag trong backend container thì socket message thật cập nhật `conversations`.

## Slice Roadmap

| Slice | Tên | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Models + Indexes | DONE | Đã thêm `Conversation`, `ConversationParticipant`, indexes nền tảng. |
| 2 | `ensureConversationForConfirmedMessage` service | DONE | Idempotent service tạo/reuse conversation + participants, maintain last-message/unread. |
| 3 | Visibility/access helpers | DONE | Đã thêm helper thuần cho readable/sidebar/archive/delete/unread/notification suppression. |
| 4 | Backfill dry-run + reconciliation checks | DONE | Read-only scanner, zero writes, báo cáo candidates/warnings. |
| 5 | Backfill write service + manual runner | DONE | Manual-only runner, default dry-run, write mode cần `--write`. |
| 6 | Guarded dual-write hook for socket message persistence | DONE | Hook trong `saveMessageInBackground`, guarded by `CONVERSATION_DUAL_WRITE_ENABLED`. |
| 6b | Conversation index/null schema fix | DONE | Fix unique sparse null bug bằng omit null fields + partial indexes. |
| 7 | Shadow compare scaffolding | DONE | Đã thêm flag disabled-by-default + read-only compare direct/group sidebar, chỉ log mismatch. |
| 8 | Expand dual-write coverage | DONE | Đã mở rộng guarded dual-write cho REST message, group system message, và call-log insert mới. |
| 9 | Reconciliation/drift report | DONE | Manual/report-only drift checks giữa legacy `Message`/`Group` và read model. |
| 10 | Sidebar candidate read service | DONE | Read-only service build sidebar candidates từ read model, chưa switch response. |
| 11 | Sidebar read switch behind flag | DONE | Direct sidebar can switch behind disabled-by-default flag with legacy fallback. |
| 12 | Search guard / historical visibility | DONE | Áp dụng visibility rules cho getMessages và syncMissedMessages. |
| 13 | Read receipts / unread reconciliation | DONE | Đồng bộ unreadCount/readState khi nhận markRead socket events. |
| 14 | Group lifecycle integration | TODO-NEXT | Add/remove member, joinedAt/leftAt, group system events. |
| 15 | Runtime confidence / gradual rollout | TODO | Bật shadow compare/staging, theo dõi mismatch, rollout từng bước. |
| 16 | Legacy cleanup planning | TODO | Chỉ lập kế hoạch cleanup sau khi read model ổn định. |

## Chi tiết các slice đã hoàn thành

### Slice 1 — Models + Indexes

- Added `Conversation` model.
- Added `ConversationParticipant` model.
- Added indexes for legacy id uniqueness, direct/group uniqueness, sidebar ordering, unread lookup.
- No runtime wiring.

### Slice 2 — `ensureConversationForConfirmedMessage` Service

- Added idempotent `ensureConversationForConfirmedMessage(message)`.
- Creates/reuses `Conversation` and `ConversationParticipant`.
- Maintains global and participant last-message fields.
- Increments unread only for visible non-sender participants.
- No runtime wiring in this slice.

### Slice 3 — Visibility / Access Helpers

- Added `conversationVisibilityHelpers`.
- Helpers:
  - `isParticipantReadable`
  - `buildMessageVisibilityFilter`
  - `isSidebarVisible`
  - `isArchivedVisible`
  - `applySoftDeleteState`
  - `canIncrementUnreadForParticipant`
  - `getNotificationSuppressionState`
- Not wired into runtime routes/controllers/search/sidebar yet.

### Slice 4 — Backfill Dry-Run + Reconciliation Checks

- Added read-only dry-run scanner.
- Scans legacy `Message` grouped by `conversationId`.
- Uses `Group` to derive group participants.
- Reports candidates and data-shape warnings.
- Zero writes.

### Slice 5 — Backfill Write Service + Manual Runner

- Added write backfill service.
- Added `server/scripts/backfillConversations.js`.
- Runner defaults to dry-run.
- Write mode requires explicit `--write`.
- Only writes `Conversation` and `ConversationParticipant`.
- No startup hook/runtime wiring.

### Slice 6 — Guarded Dual-Write Hook For Socket Message Persistence

- Added `CONVERSATION_DUAL_WRITE_ENABLED`, default `false`.
- Added guarded hook in `saveMessageInBackground`.
- Hook runs only when flag is true, `savedMessage` exists, and `isDuplicate === false`.
- Read-model errors are logged/swallowed.
- Existing Redis chat cache and conversation recency behavior unchanged.

### Slice 6b — Conversation Index / Null Schema Fix

- Fixed MongoDB unique sparse null bug:
  - `E11000 duplicate key error collection: shot-chat.conversations index: groupId_1 dup key: { groupId: null }`
- Direct conversations now omit `groupId`.
- Group conversations now omit `directKey`.
- Direct/group unique indexes use `partialFilterExpression`.
- Write payloads avoid non-applicable null fields.

### Slice 7 — Shadow Compare Scaffolding

- Added `CONVERSATION_SHADOW_COMPARE_ENABLED`, default `false`.
- Added read-only `conversationShadowCompareService` for direct/group sidebar candidate comparison.
- Added guarded hooks after legacy direct/group sidebar output is built.
- Shadow compare errors are logged/swallowed.
- Client responses, Socket.IO payloads/rooms, Redis keys, and RabbitMQ behavior remain unchanged.

### Slice 8 — Expand Dual-Write Coverage

- Added shared `dualWriteConfirmedMessage` helper guarded by `CONVERSATION_DUAL_WRITE_ENABLED=false`.
- REST `createMessage` now dual-writes after confirmed legacy save.
- `createSystemMessage` now dual-writes group lifecycle system messages after confirmed save.
- `createCallLogMessage` now dual-writes only when Mongo upsert inserts a new `call_log` message, not when updating an existing call log.
- Read-model errors are logged/swallowed and legacy responses/events remain unchanged.
- Socket.IO payloads/rooms, Redis keys, RabbitMQ behavior, sidebar/search reads, and client response shapes remain unchanged.

### Slice 9 — Reconciliation / Drift Report

- Added read-only `conversationReconciliationReport` service.
- Added manual `server/scripts/reconcileConversations.js` runner.
- Runner rejects `--write`; no repair/backfill writes are performed.
- Report compares legacy `Message.conversationId` groups with `Conversation` and `ConversationParticipant` rows.
- Reports missing conversations, missing participants, last-message drift, unread-count drift, and group participant drift.
- Client responses, Socket.IO payloads/rooms, Redis keys, RabbitMQ behavior, sidebar/search reads, and read-model write paths remain unchanged.

### Slice 10 — Sidebar Candidate Read Service

- Added read-only `conversationSidebarCandidateService`.
- Service returns default sidebar candidates from populated `ConversationParticipant` + `Conversation` rows.
- Candidate output preserves legacy `conversationId` / `legacyConversationId` and does not expose internal `Conversation._id`.
- Archived, soft-deleted, left, and no-last-message participant rows are excluded from default sidebar candidates.
- Ordering is deterministic by pinned time, last-message time, then legacy conversation id.
- No existing sidebar API response, Socket.IO payload, Redis key, RabbitMQ behavior, or search behavior changed.

### Slice 11 — Sidebar Read Switch Behind Flag

- Added `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED`, default `false`.
- Direct sidebar remains legacy-authoritative while the flag is disabled.
- When enabled, direct sidebar can order/read from read-model candidates while preserving the existing response shape.
- Read-model candidate errors or unsafe candidate state fall back to the existing legacy sidebar path.
- `Conversation._id` is not exposed in sidebar responses.
- Socket.IO payloads/rooms, Redis keys, RabbitMQ behavior, and search behavior remain unchanged.

### Slice 12 — Search Guard / Historical Visibility

- Applied `conversationVisibilityHelpers` bounds to `getMessages` (conversation history) and `syncMissedMessages` (read-history sync).
- Both paths perform IDOR-safe bounds checking using existing `ConversationParticipant` state.
- Fallback to legacy full history query on missing participant or database query error.
- No `Conversation._id` exposed, and legacy identity contracts remain unchanged.
- Socket.IO payloads/rooms, Redis keys, RabbitMQ behavior, and client response shapes remain unchanged.

### Slice 13 — Read Receipts / Unread Reconciliation

- Added read-model helper `markConversationAsRead` to update `unreadCount`, `lastReadMessageId`, and `lastReadAt` inside `ConversationParticipant` state.
- Wired unread sync into direct and group `SOCKET_EVENTS.MESSAGE_MARK_READ` socket events after confirmed legacy database persistence.
- Read-model write errors are caught and logged, allowing legacy read receipts processing to continue.
- No client response shapes, Socket.IO rooms, Redis keys, or RabbitMQ behavior changed.

## Manual verification đã có

- Docker Compose full system runs.
- Host shell env does not affect backend container env.
- `CONVERSATION_DUAL_WRITE_ENABLED=true` must be passed into backend container env for Docker testing.
- Backend container confirmed flag via `printenv`.
- Real UI socket message confirmed to trigger dual-write.
- After index/schema fix, UI message updates MongoDB `conversations`.

## Latest known test results

- After Slice 6: targeted suite `63/63`, full server regression `224/224`.
- After index/schema fix: targeted env/save/read-model suite `66/66`, full regression `227/227`.
- After Slice 7: targeted env/shadow/read-model suite `30/30`, full server regression `240/240`.
- After Slice 8: targeted message/call/read-model suite `44/44`, full server regression `247/247`.
- After Slice 9: targeted reconciliation suite `7/7`, read-model regression `39/39`, full server regression `254/254`.
- After Slice 10: targeted sidebar candidate suite `4/4`, sidebar/read-model regression `28/28`, full server regression `258/258`.
- After Slice 11: targeted env/sidebar switch suite `23/23`, full server regression `261/261`.
- After Slice 12: targeted visibility suite `5/5`, read-model regression `52/52`, full server regression `266/266`.
 - After Slice 13: targeted read receipt suite `3/3`, read-model regression `55/55`, full server regression `269/269`.

## Known risks

- Direct sidebar legacy includes friends without messages; read model naturally only has conversations after message/backfill.
- Group sidebar legacy uses `Group.members`; read-model participant rows can drift until group lifecycle integration exists.
- Unread semantics differ by source:
  - Direct legacy: `receiver + isRead=false`.
  - Group legacy: `readBy`.
  - Read model: `ConversationParticipant.state.unreadCount`.
- Do not switch sidebar/search before shadow compare and reconciliation evidence.

## Current next slice

Slice 14 — Group lifecycle integration.

Synchronize group membership changes, joinedAt/leftAt boundaries, and group system events into Conversation Read Model.
