# Conversation Read Model Slice

Dùng khi triển khai một slice mới của Conversation Read Model migration.

## Checklist

1. Read current state.
   - `.agents/current-session.md`
   - `.agents/next-session.md`
   - `specs/active/conversation-read-model-migration.md`

2. Read relevant rules.
   - `.agents/rules/data-ownership.md`
   - `.agents/rules/conversation-identity.md`
   - `.agents/rules/conversation-read-model-migration.md`
   - `.agents/rules/realtime-state.md` if touching Socket.IO/sidebar/realtime paths.

3. Confirm slice boundary.
   - State what is in scope.
   - State explicit non-goals.
   - Do not start the next slice automatically.

4. Inspect current flow before editing.
   - Identify legacy source of truth.
   - Identify public contract: REST response, Socket.IO payload, Redis key, Mongo model.
   - Identify tests already covering the flow.

5. Use TDD.
   - Add failing targeted tests first.
   - Verify failure when practical.
   - Implement minimum code.
   - Run targeted tests.

6. Preserve migration safety.
   - New runtime behavior must be disabled by default unless approved.
   - Shadow compare must be read-only.
   - Backfill write must remain manual-only.
   - Dual-write errors must not break legacy persistence.
   - Do not expose `Conversation._id` to clients.
   - Do not replace `Message.conversationId` as public bridge.

7. Verify broadly.
   - Run targeted read-model/env/controller tests.
   - Run full server regression when implementation touches server behavior.
   - Add manual Docker verification steps if behavior depends on container env.

8. Update durable docs.
   - Update `.agents/current-session.md` when slice status changes.
   - Update `.agents/next-session.md` with the next slice only.
   - Append `docs/decisions.md` only for important technical decisions.
   - Update `.agents/rules/` only when a new invariant is discovered.

## Done When

- Slice requirements are met.
- Tests and manual checks are reported.
- No explicit non-goal was implemented.
- Session docs identify the next slice.
