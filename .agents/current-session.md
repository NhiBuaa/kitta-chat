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
| 8 | Expand dual-write coverage | TODO NEXT | Xem xét REST message, system message, call-log, group lifecycle paths. |
| 9 | Reconciliation/drift report | TODO | Manual/report-only drift checks giữa legacy `Message`/`Group` và read model. |
| 10 | Sidebar candidate read service | TODO | Build read-model sidebar service nhưng chưa switch response. |
| 11 | Sidebar read switch behind flag | TODO | Switch sidebar response sau flag, fallback an toàn, không đổi API shape. |
| 12 | Search guard / historical visibility | TODO | Áp dụng visibility rules cho message search/read history. |
| 13 | Read receipts / unread reconciliation | TODO | Đồng bộ read state vào `ConversationParticipant`. |
| 14 | Group lifecycle integration | TODO | Add/remove member, joinedAt/leftAt, group system events. |
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

## Known risks

- Dual-write currently covers socket message persistence only.
- REST message, system message, call-log, and group lifecycle paths are not covered yet.
- Direct sidebar legacy includes friends without messages; read model naturally only has conversations after message/backfill.
- Group sidebar legacy uses `Group.members`; read-model participant rows can drift until group lifecycle integration exists.
- Unread semantics differ by source:
  - Direct legacy: `receiver + isRead=false`.
  - Group legacy: `readBy`.
  - Read model: `ConversationParticipant.state.unreadCount`.
- Do not switch sidebar/search before shadow compare and reconciliation evidence.

## Current next slice

Slice 8 — Expand dual-write coverage.

See `.agents/next-session.md` for the next implementation brief.
