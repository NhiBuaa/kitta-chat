# Next Session — Slice 14 Group Lifecycle Integration

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 14: synchronize group membership changes, joinedAt/leftAt boundaries, and group system events into Conversation Read Model.

## Bối cảnh

Đã hoàn thành Slice 13:

- Added read-model helper `markConversationAsRead` to update `unreadCount` and timestamps in `ConversationParticipant`.
- Wired unread sync into direct and group socket `markRead` event handlers.
- Swallowed read-model errors to prevent legacy path disruption.

Runtime hiện tại:

- `Message.conversationId` vẫn là public/socket/cache bridge.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Direct sidebar read switch is coded but disabled by default.

## Mục tiêu Slice 14

Synchronize group lifecycle changes (adding/removing members, joinedAt/leftAt boundaries, role updates, and group system events) into the Conversation Read Model.

## Guardrails bắt buộc

- Do not expose `Conversation._id`.
- Do not change Socket.IO payloads/rooms.
- Do not change Redis/RabbitMQ behavior.
- Keep response shapes stable.
- Swallow and log read-model errors on write paths.

## Gợi ý scope

- Identify group lifecycle endpoints in `groupController.js` (e.g. create group, add member, remove member, leave group).
- Add targeted tests using public interfaces.
- Synchronize participants (`joinedAt`, `leftAt`, `role`) into `ConversationParticipant` after confirmed legacy database updates.

## Non-goals

- Không cleanup legacy sidebar code.
- Không switch sidebar/search reads by default.
