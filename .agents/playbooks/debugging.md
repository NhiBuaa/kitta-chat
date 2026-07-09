# Debugging

Dùng khi có bug, crash, failing behavior, Docker/runtime mismatch, hoặc test regression.

## Checklist

1. Reproduce bug.
   - Ghi command/UI action cụ thể.
   - Ghi expected vs actual.
   - Ghi environment: local, Docker, test, dev DB.

2. Collect evidence.
   - Đọc log liên quan.
   - Kiểm tra env trong đúng process/container.
   - Kiểm tra DB/cache nếu bug liên quan state.
   - Tìm test hiện có cover behavior tương tự.

3. Identify affected contract.
   - API response shape?
   - Socket.IO event/payload/room?
   - MongoDB durable state?
   - Redis cache/coordination?
   - RabbitMQ background job?
   - Client optimistic/retry behavior?

4. Read relevant rules.
   - Data/cache/worker bug: `.agents/rules/data-ownership.md`.
   - Conversation identity/read model bug: `.agents/rules/conversation-identity.md` and `.agents/rules/conversation-read-model-migration.md`.
   - Realtime bug: `.agents/rules/realtime-state.md`.
   - Auth bug: `.agents/rules/auth-session.md`.
   - Call bug: `.agents/rules/calls.md`.

5. Form a root-cause hypothesis.
   - State the smallest likely cause.
   - Do not patch symptoms before validating the hypothesis.

6. Write or update a failing test.
   - Prefer behavior/integration-style test through public interface.
   - If the bug is an index/schema/runtime mismatch, add a regression test for that exact class.

7. Fix the root cause.
   - Keep patch minimal.
   - Do not refactor unrelated code.
   - Preserve existing public contracts unless explicitly approved.

8. Verify.
   - Run targeted test first.
   - Run broader regression when appropriate.
   - Repeat manual reproduction steps if the bug was manual/Docker-only.

9. Record durable learning.
   - Add/update `.agents/rules/` if the bug revealed a domain invariant.
   - Append `docs/decisions.md` if the fix reflects an important technical decision.
   - Update `.agents/current-session.md` or `.agents/next-session.md` if migration state changed.

## Done When

- Bug is reproduced or clearly explained as non-reproducible.
- Root cause is identified.
- Regression coverage exists when practical.
- Targeted verification passes.
- Any durable rule/decision/session update is captured.
