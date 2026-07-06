# New Feature Implementation

Dùng khi triển khai một feature mới hoặc mở rộng đáng kể một feature hiện có.

## Checklist

1. Define the feature.
   - Xác định user problem.
   - Xác định behavior mong đợi.
   - Xác định done conditions.
   - Nếu chưa có spec, tạo file trong `specs/active/` trước khi code.

2. Read project context.
   - `.agents/CONTEXT.md`
   - `.agents/AGENTS.md`
   - `docs/decisions.md` nếu feature chạm quyết định kỹ thuật hiện có.

3. Read relevant rules.
   - Data/cache/worker: `.agents/rules/data-ownership.md`.
   - Conversation identity/read model: `.agents/rules/conversation-identity.md` và `.agents/rules/conversation-read-model-migration.md`.
   - Realtime/socket/presence/typing: `.agents/rules/realtime-state.md`.
   - Auth/session: `.agents/rules/auth-session.md`.
   - Calls: `.agents/rules/calls.md`.

4. Inspect existing flow.
   - Tìm models/controllers/services/socket handlers/client state liên quan.
   - Xác định public contracts: REST response, Socket.IO payload, Redis key, Mongo document shape.
   - Xác định tests hiện có.
   - Không đoán architecture nếu có thể đọc code.

5. Decide the smallest safe slice.
   - Tách feature thành vertical slice nhỏ nhất có thể verify.
   - Ghi rõ in scope.
   - Ghi rõ non-goals.
   - Nếu có migration/runtime risk, dùng disabled-by-default flag hoặc shadow path trước.

6. Use TDD.
   - Viết failing test trước.
   - Ưu tiên behavior/integration-style tests qua public interface.
   - Verify failure khi practical.
   - Implement minimum code.
   - Refactor chỉ khi tests đang xanh.

7. Preserve contracts.
   - Không đổi API/socket payload nếu không nằm trong scope.
   - Không expose internal ids/secrets.
   - Không đổi Redis/RabbitMQ ownership ngoài scope.
   - Không sửa unrelated bugs/refactors trong cùng slice.

8. Verify.
   - Run targeted tests.
   - Run broader regression nếu chạm runtime/server behavior.
   - Nếu feature có UI/realtime/Docker behavior, ghi manual verification checklist.

9. Update docs.
   - Update spec trong `specs/active/` theo behavior thực tế.
   - Khi feature hoàn thành, chuyển spec sang `specs/done/`.
   - Add/update `.agents/rules/` nếu có invariant domain mới.
   - Append `docs/decisions.md` nếu có quyết định kỹ thuật quan trọng.
   - Update `.agents/current-session.md` / `.agents/next-session.md` nếu feature thuộc roadmap hiện tại.

## Done When

- Spec tồn tại và khớp behavior đã implement.
- Tests targeted pass.
- Regression/manual verification được báo cáo phù hợp.
- Public contracts được giữ hoặc thay đổi có chủ đích.
- Rules/decisions/session docs được cập nhật nếu có durable change.
- Feature spec đã được chuyển sang `specs/done/` nếu feature hoàn tất.
