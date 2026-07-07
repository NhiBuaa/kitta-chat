# Next Session — Slice 12 Search Guard / Historical Visibility

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 12: apply visibility guards to message search/read-history behavior without changing identity contracts.

## Bối cảnh

Đã hoàn thành Slice 11:

- Added `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED`, default `false`.
- Direct sidebar can switch to read-model candidates only when the flag is enabled.
- Existing sidebar response shape is preserved.
- Read-model errors or unsafe candidate state fall back to legacy sidebar behavior.
- `Conversation._id` is not exposed.

Runtime hiện tại:

- `Message.conversationId` vẫn là public/socket/cache bridge.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Search behavior has not been changed yet.

## Mục tiêu Slice 12

Use existing Conversation Read Model visibility helpers to guard message search/read-history access where the behavior can be preserved safely.

## Guardrails bắt buộc

- Do not expose `Conversation._id`.
- Do not change `Message.conversationId` contracts.
- Do not change Socket.IO payloads/rooms.
- Do not change Redis/RabbitMQ behavior.
- Keep response shapes stable.
- Prefer guarded/fallback behavior if read-model participant state is missing.

## Gợi ý scope

- Identify message search/read-history endpoints.
- Add tests for deleted/left participant visibility windows using public controller/service interfaces.
- Use `buildMessageVisibilityFilter` / `isParticipantReadable` where applicable.
- Preserve legacy access when no read-model participant exists unless an explicit guard can safely deny.

## Non-goals

- Không cleanup legacy sidebar code.
- Không expand dual-write coverage.
- Không repair reconciliation drift.
- Không change group lifecycle membership writes.
