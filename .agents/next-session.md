# Next Session — Slice 13 Read Receipts / Unread Reconciliation

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 13: synchronize read receipts and unread count status into `ConversationParticipant` state.

## Bối cảnh

Đã hoàn thành Slice 12:

- Applied `conversationVisibilityHelpers` bounds to `getMessages` and `syncMissedMessages`.
- Enforced visibility window boundaries based on soft-delete (`deletedAt`) and group membership status (`leftAt`).
- Preserved legacy query paths as fallbacks on errors or missing participant rows.

Runtime hiện tại:

- `Message.conversationId` vẫn là public/socket/cache bridge.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Direct sidebar read switch is coded but disabled by default.

## Mục tiêu Slice 13

Update read-model participant state (such as `unreadCount`, `lastReadMessageId`, and `lastReadAt`) during message read status updates (e.g. read receipt events or REST API calls) where supported.

## Guardrails bắt buộc

- Do not expose `Conversation._id`.
- Do not change Socket.IO payloads/rooms.
- Do not change Redis/RabbitMQ behavior.
- Keep response shapes stable.
- Swallow and log read-model errors on write paths.

## Gợi ý scope

- Identify where message read receipts/unread status changes are processed in controllers or socket handlers.
- Add targeted tests using public interfaces first.
- Wire read-model participant state updates safely after confirmed legacy state change.

## Non-goals

- Không switch search.
- Không cleanup legacy sidebar code.
- Không integrate group lifecycle membership changes.
