# Next Session — Slice 11 Sidebar Read Switch Behind Flag

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 11: sidebar read switch behind a disabled-by-default flag.

## Bối cảnh

Đã hoàn thành Slice 10:

- Added read-only `conversationSidebarCandidateService`.
- Service builds deterministic default sidebar candidates from populated `ConversationParticipant` + `Conversation` rows.
- Candidate output preserves legacy `conversationId` / `legacyConversationId` and does not expose internal `Conversation._id`.
- Existing sidebar API responses, Socket.IO payloads, Redis keys, RabbitMQ behavior, and search behavior remain unchanged.

Runtime hiện tại vẫn legacy-authoritative:

- `Message.conversationId` không đổi.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Sidebar/search vẫn legacy khi flag mới tắt.
- `Conversation._id` không expose ra client.
- `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- `CONVERSATION_SHADOW_COMPARE_ENABLED=false` mặc định.

## Mục tiêu Slice 11

Add an explicit disabled-by-default flag that can switch sidebar read responses to read-model candidates with safe fallback to the existing legacy sidebar behavior.

## Guardrails bắt buộc

- Flag must default to disabled.
- Existing sidebar response shape must remain stable.
- Fallback to legacy sidebar behavior on read-model errors or unsafe candidate state.
- Do not expose `Conversation._id`.
- Do not change Socket.IO payloads/rooms.
- Do not change Redis/RabbitMQ behavior.
- Do not change search behavior in this slice.

## Gợi ý scope

- Add env config for the sidebar read-switch flag.
- Wire direct sidebar endpoint only if response shape can be preserved safely.
- Preserve legacy implementation as fallback path.
- Keep shadow compare/reconciliation separate from switching behavior.
- Add tests for default-off legacy behavior, flag-on read-model behavior, fallback, and response shape.

## Non-goals

- Không switch search.
- Không repair reconciliation drift.
- Không change Socket.IO or Redis keys.
- Không integrate group lifecycle membership changes.
- Không cleanup legacy sidebar code.
