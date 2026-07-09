# Known Issues

Memory là nơi lưu lại bài học và vấn đề đã biết để không lặp lại sai lầm.

Quy tắc cập nhật:

- Ghi ngay sau khi fix bug khó hoặc rút ra bài học quan trọng.
- Ghi ngắn gọn: symptom, root cause, fix, prevention.
- Không dùng file này thay cho specs, rules, hoặc decisions.
- Nếu bài học tạo ra invariant lâu dài, cập nhật thêm `.agents/rules/`.
- Nếu bài học phản ánh quyết định kỹ thuật quan trọng, append thêm `docs/decisions.md`.

## Conversation dual-write fails on second direct conversation

**Symptom**: Khi bật `CONVERSATION_DUAL_WRITE_ENABLED=true` trong Docker và gửi message thật từ UI, tạo direct conversation thứ hai có thể fail với lỗi:

```text
E11000 duplicate key error collection: shot-chat.conversations index: groupId_1 dup key: { groupId: null }
```

**Root cause**: MongoDB unique sparse indexes vẫn index field tồn tại với giá trị `null`. Direct conversations từng persist `groupId: null`, nên unique index `{ groupId: 1 }` chỉ cho phép một document direct có `groupId: null`. Risk tương tự tồn tại nếu group conversations lưu `directKey: null`.

**Fix**:

- Direct conversations omit `groupId`.
- Group conversations omit `directKey`.
- Unique direct/group indexes dùng `partialFilterExpression` thay vì unique sparse-null behavior.
- Write payloads tránh `$setOnInsert` non-applicable null fields.

**Prevention**:

- Khi dùng unique index cho optional fields, không dựa vào `sparse` nếu documents có thể lưu `null`.
- Test cả nhiều direct conversations và nhiều group conversations.
- Local dev DB có index cũ có thể cần drop/rebuild index thủ công.

**Related rules**:

- `.agents/rules/conversation-read-model-migration.md`
- `.agents/rules/conversation-identity.md`

## Docker Compose env must be set inside backend container

**Symptom**: Host shell đã set env flag nhưng backend container vẫn không đổi behavior; dual-write không chạy hoặc env validation fail.

**Root cause**: Host shell env không tự động truyền vào container runtime khi dùng Docker Compose. Backend chỉ thấy env được khai báo trong compose/env file/container environment.

**Fix**:

- Truyền flag qua `docker-compose.dev.yml`, compose override, hoặc env file được backend container đọc.
- Verify bằng command trong container, ví dụ:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend printenv CONVERSATION_DUAL_WRITE_ENABLED
```

**Prevention**:

- Khi debug Docker-only behavior, luôn kiểm tra env bên trong container trước khi nghi ngờ code path.
- Không kết luận feature flag đã bật chỉ dựa vào host shell.

**Related rules**:

- `.agents/rules/data-ownership.md`
- `.agents/rules/conversation-read-model-migration.md`

## Boolean migration flags reject invalid string values

**Symptom**: Backend crash lúc startup với lỗi config validation, ví dụ:

```text
ConfigValidationError: server configuration is invalid: CONVERSATION_DUAL_WRITE_ENABLED must be either true or false
```

**Root cause**: Env parser chỉ chấp nhận boolean string hợp lệ như `true` hoặc `false`. Giá trị rỗng, sai chính tả, có quote/space bất thường, hoặc format khác sẽ bị reject theo convention hiện tại.

**Fix**:

- Set flag rõ ràng thành `true` hoặc `false`.
- Nếu chạy Docker, sửa đúng env của backend container và restart/rebuild nếu cần.

**Prevention**:

- Thêm env validation tests cho mọi migration flag mới.
- Với flag mới, default phải an toàn, thường là `false`.
- Manual verification phải kiểm tra `printenv` trong process/container thật.

**Related rules**:

- `.agents/rules/conversation-read-model-migration.md`

## Conversation Read Model dual-write currently covers socket message persistence only

**Symptom**: Read model có thể thiếu rows hoặc drift so với legacy data nếu message/group/call được tạo qua path không phải socket message persistence.

**Root cause**: Slice 6 chỉ wire dual-write vào `saveMessageInBackground` cho confirmed non-duplicate socket messages. REST message, system message, call-log message, và group lifecycle paths chưa được dual-write.

**Fix**:

- Không coi read model là complete source of truth ở giai đoạn hiện tại.
- Dùng manual backfill hoặc slice mở rộng dual-write sau khi được duyệt.
- Dùng shadow compare/reconciliation trước khi switch sidebar/search reads.

**Prevention**:

- Khi thấy mismatch read model, kiểm tra message được tạo từ path nào trước.
- Không switch sidebar/search sang read model chỉ vì socket dual-write đã hoạt động.
- Mọi path dual-write mới phải là slice riêng, có tests và non-goals rõ ràng.

**Related rules**:

- `.agents/rules/conversation-read-model-migration.md`
- `.agents/rules/conversation-identity.md`

## Legacy sidebar and read model derive state differently

**Symptom**: Shadow compare hoặc manual inspection có thể thấy sidebar legacy và read-model candidate khác nhau, nhất là direct friends chưa nhắn tin, group membership, hoặc unread count.

**Root cause**:

- Direct sidebar legacy merge Redis ZSET, `Message.aggregate`, và `User.friends`; friends chưa nhắn tin vẫn hiển thị.
- Group sidebar legacy dựa vào `Group.members` và `Message.aggregate`.
- Direct unread legacy dùng `receiver + isRead=false`.
- Group unread legacy dùng `readBy`.
- Read model dùng `ConversationParticipant.state.unreadCount` và participant visibility state.

**Fix**:

- Shadow compare phải read-only và chỉ log/report mismatch.
- Reconcile nguyên nhân mismatch trước khi read-switch.
- Không đổi client response trong shadow compare slice.

**Prevention**:

- Khi triển khai sidebar read model, test riêng direct, group, friends-without-message, unread, archived/deleted/left scenarios.
- Không assume `ConversationParticipant` đã thay thế hoàn toàn `Group.members` trước group lifecycle integration.

**Related rules**:

- `.agents/rules/conversation-read-model-migration.md`
- `.agents/rules/conversation-identity.md`

## Presence heartbeat must not write MongoDB repeatedly

**Symptom**: Presence/heartbeat thay đổi có thể tạo write load lớn nếu ghi MongoDB theo mỗi heartbeat.

**Root cause**: Heartbeat là realtime/ephemeral state, không phải durable domain event cần persist liên tục.

**Fix**:

- Heartbeat chỉ refresh Redis state/TTL theo flow hiện tại.
- Durable user profile/status writes chỉ xảy ra ở flow có chủ đích.

**Prevention**:

- Khi sửa presence, kiểm tra không thêm MongoDB write vào heartbeat loop.
- Treat Redis presence expiration as ephemeral state loss, not durable user data loss.

**Related rules**:

- `.agents/rules/realtime-state.md`
- `.agents/rules/data-ownership.md`

## Canonical project context lives in `.agents/CONTEXT.md`

**Symptom**: AI/dev có thể tìm hoặc tạo nhầm root `CONTEXT.md`, trong khi project context canonical của repo này đang nằm ở `.agents/CONTEXT.md`.

**Root cause**: Một số workflow/skill mặc định giả định context nằm ở root `CONTEXT.md`, nhưng dự án này đã chọn lưu project context trong `.agents/CONTEXT.md`.

**Fix**:

- Đọc `.agents/CONTEXT.md` khi cần project/domain context.
- Không assume root `CONTEXT.md` là canonical context của dự án này.

**Prevention**:

- Khi bắt đầu session, đọc `.agents/AGENTS.md` trước để biết source-of-truth layout.
- Nếu thấy root `CONTEXT.md` và `.agents/CONTEXT.md` cùng tồn tại, hỏi lại hoặc ưu tiên convention trong `.agents/AGENTS.md`.

**Related files**:

- `.agents/CONTEXT.md`
- `.agents/AGENTS.md`

## Specs must be separated by status

**Symptom**: Nếu tất cả specs nằm chung một folder, AI có thể đọc nhầm spec đã hoàn thành là feature còn cần implement, hoặc tham chiếu nhầm feature cũ như việc đang active.

**Root cause**: Specs không có trạng thái rõ ràng khiến context retrieval thiếu tín hiệu đâu là feature đang làm và đâu là feature đã xong.

**Fix**:

- Feature đang làm nằm trong `specs/active/`.
- Feature đã hoàn thành nằm trong `specs/done/`.
- Khi bắt đầu feature mới, tạo spec trong `specs/active/`.
- Khi feature xong, chuyển spec sang `specs/done/`.

**Prevention**:

- Không để spec active và done chung một folder lâu dài.
- Trước khi implement feature, kiểm tra spec tương ứng đang nằm trong `active/` hay `done/`.
- Không implement lại feature chỉ vì thấy spec trong `done/`.

**Related files**:

- `specs/README.md`
- `specs/active/`
- `specs/done/`

## Rules are domain invariants, not AI process instructions

**Symptom**: AI có thể nhầm `.agents/rules/` với `.agents/AGENTS.md`, dẫn đến đặt process instructions vào rules hoặc bỏ qua domain invariants khi code.

**Root cause**: Cả hai đều là agent-facing docs, nhưng chúng có mục đích khác nhau.

**Fix**:

- `.agents/AGENTS.md` mô tả AI nên làm việc như thế nào.
- `.agents/rules/` mô tả hệ thống phải luôn tuân theo rule domain/system nào.
- Trước khi sửa code, đọc rule liên quan theo mapping trong `.agents/AGENTS.md`.

**Prevention**:

- Nếu nội dung là "AI phải làm gì khi code", đặt trong `AGENTS.md`.
- Nếu nội dung là "hệ thống không bao giờ/luôn phải thế nào", đặt trong `rules/`.
- Nếu request vi phạm rule, dừng trước khi code và yêu cầu decision/update rõ ràng.

**Related files**:

- `.agents/AGENTS.md`
- `.agents/rules/README.md`

## Playbooks are checklists from repeated practice, not theory

**Symptom**: AI/dev có thể tạo playbook quá sớm cho workflow chưa từng được dùng, khiến playbook trở thành lý thuyết và dễ gây nhiễu.

**Root cause**: Playbook chỉ hữu ích khi nó đúc kết một quy trình đã lặp lại nhiều lần; nếu tạo trước, nó thường không phản ánh thực tế dự án.

**Fix**:

- Chỉ tạo/cập nhật playbook sau khi đã debug, migrate, release, hoặc implement theo cùng pattern ít nhất 2-3 lần.
- Playbook phải là checklist thao tác, không phải giải thích dài dòng.

**Prevention**:

- Nếu là rule domain, đưa vào `.agents/rules/`.
- Nếu là behavior feature, đưa vào `specs/`.
- Nếu là quyết định/lý do, đưa vào `docs/decisions.md`.
- Nếu chỉ là workflow đã lặp lại, mới đưa vào `.agents/playbooks/`.

**Related files**:

- `.agents/playbooks/README.md`
- `.agents/playbooks/debugging.md`
- `.agents/playbooks/new-feature.md`

## Session roadmap lives in `.agents/current-session.md` and `.agents/next-session.md`

**Symptom**: AI có thể dựa vào chat history hoặc handoff cũ để xác định migration state, dẫn đến lặp slice đã xong hoặc nhảy sang slice chưa được duyệt.

**Root cause**: Conversation context dài và thay đổi qua nhiều session; chat history không phải source of truth bền vững.

**Fix**:

- `.agents/current-session.md` chứa roadmap tổng thể, trạng thái slice, runtime state, risks.
- `.agents/next-session.md` chứa slice kế tiếp được duyệt để làm.
- Trước khi làm migration/feature trong roadmap, đọc hai file này.

**Prevention**:

- Sau khi hoàn thành slice, cập nhật `current-session.md`.
- Sau khi xác định slice kế tiếp, cập nhật `next-session.md`.
- Không tự bắt đầu slice kế tiếp nếu `next-session.md` chưa nói rõ hoặc user chưa yêu cầu.

**Related files**:

- `.agents/current-session.md`
- `.agents/next-session.md`
- `.agents/playbooks/conversation-read-model-slice.md`

## `docs/handoff/NEXT_SESSION_BOOTSTRAP.md` is obsolete for current workflow

**Symptom**: AI có thể đọc `docs/handoff/NEXT_SESSION_BOOTSTRAP.md` và dùng thông tin cũ làm context chính, gây nhầm lẫn với `.agents/current-session.md` và `.agents/next-session.md`.

**Root cause**: Dự án đã chuyển source of truth của session state sang `.agents/current-session.md` và `.agents/next-session.md`, nhưng file handoff cũ vẫn có thể tồn tại trong repo.

**Fix**:

- Không dùng `docs/handoff/NEXT_SESSION_BOOTSTRAP.md` làm source of truth cho session hiện tại.
- Dùng `.agents/current-session.md` và `.agents/next-session.md` thay thế.

**Prevention**:

- Khi thấy mâu thuẫn giữa handoff cũ và `.agents/`, ưu tiên `.agents/`.
- Nếu file handoff cũ gây nhiễu nhiều lần, cân nhắc archive/delete trong một cleanup task riêng.

**Related files**:

- `.agents/current-session.md`
- `.agents/next-session.md`
- `docs/handoff/NEXT_SESSION_BOOTSTRAP.md`
