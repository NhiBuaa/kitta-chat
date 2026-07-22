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

## Tech Debt

### resourceService loaders share duplicated batch-scan pattern

**Friction**: `loadMedia`, `loadFiles`, `loadLinks` trong `server/src/services/resourceService.js` có cấu trúc gần giống nhau: cùng mô hình `while (!stopGom)` batch-scan, cùng visibility filter setup via `ConversationParticipant`, cùng cursor pagination logic. Chỉ khác điều kiện query và cách xử lý kết quả bên trong vòng lặp.

**Evidence**: 3 hàm, mỗi hàm ~65 dòng, ~80% cấu trúc giống nhau. Nếu sửa logic pagination hoặc visibility filter, phải sửa ở cả 3 nơi.

**Desired Outcome**: Extract generic `batchScanMessages(query, transformFn, options)` factory hoặc tương tự, để mỗi loader chỉ cần khai báo query filter và transform logic riêng.

**Risk nếu không fix**: Divergence khi sửa 1 chỗ quên sửa chỗ khác. Rủi ro tăng nếu có thêm loaders (ví dụ: voice messages, polls).

**When to fix**: Sau khi tất cả resource loaders đã ổn định và không còn thay đổi schema/query lớn.

**Related files**:

- `server/src/services/resourceService.js`
- `server/test/resourceService.test.js`

### URL parentheses edge case in link parser

**Friction**: Regex `match.replace(/[.,;:!?)]+$/, "")` trong `extractAndNormalizeLinks` (Message.js) và `renderMessageTextWithLinks` (ChatWindow.jsx) loại bỏ dấu `)` ở cuối URL, nhưng `)` có thể là phần hợp lệ của URL (ví dụ: Wikipedia links).

**Evidence**: URL `https://en.wikipedia.org/wiki/JavaScript_(programming_language)` sẽ bị cắt mất `)` cuối → link hỏng 404.

**Desired Outcome**: Sử dụng thuật toán đếm matched parentheses thay vì regex đơn giản, hoặc chỉ loại bỏ `)` khi số `)` vượt quá số `(`.

**Risk nếu không fix**: Edge case hiếm trong chat thông thường. Chỉ ảnh hưởng Wikipedia-style URLs.

**When to fix**: Khi có user report hoặc khi refactor link parser lớn hơn.

**Related files**:

- `server/src/models/Message.js` (extractAndNormalizeLinks)
- `client/src/features/chat/components/ChatWindow.jsx` (renderMessageTextWithLinks)

## Sidebar API response shape mismatch with legacy handleSelectUser

**Symptom**: Click conversation trên sidebar không mở được chat (cả direct và group). Chat nhóm hiện subtitle bị thừa dấu `:` khi senderName rỗng (": A đã tạo nhóm").

**Root cause**:
1. `Sidebar.jsx` truyền raw API conversation object vào `handleSelectUser(conv)`. API `/api/sidebar/conversations` trả về `{ conversationId, target: { _id, displayName, ... }, kind, ... }` nhưng `handleSelectUser` expect `{ _id, members, displayName, avatar }` (legacy user/group shape). Thiếu `_id` top-level khiến `setActiveChat` set object thiếu identifier.
2. `renderSubtitle` dùng template literal `` `${senderName}: ${content}` `` không guard empty string. API trả `senderName: ""` khi sender chưa enrich, output thành `: nội dung`.

**Fix**:
- `Sidebar.jsx`: Tạo `selectPayload` transform `conv.target._id` → `_id`, thêm `members: true` cho group, map `displayName`/`avatar` lên top-level.
- `Sidebar.jsx`: Guard `senderName` trước khi concat.

**Prevention**: Khi component mới consume API response mới nhưng truyền data vào callback/handler cũ (legacy), luôn kiểm tra contract/shape mà handler expect. Viết regression test kiểm tra object shape transformation.

**Related files**:

- `client/src/components/layout/Sidebar.jsx`
- `client/src/features/chat/pages/ChatPage.jsx` (handleSelectUser)
- `server/src/controllers/sidebarController.js`

## Group Model Schema Field Mismatch & Group Members Payload Shape

**Symptom**:
- Chat nhóm bên sidebar hiển thị tên nhóm là "Không rõ"
- Khi bấm vào chat nhóm, hiển thị "undefined Thành viên" và không gửi được tin nhắn

**Root cause**:
1. **BUG-D**: `sidebarController.js` dùng `Group.find().select("displayName ...")` và `target.displayName = g.displayName`. Tuy nhiên `Group` Mongoose model chỉ định nghĩa field `name`, không phải `displayName`. Kết quả là `g.displayName` luôn trả về `undefined`.
2. **BUG-E**: `Sidebar.jsx` gán `members: true` (boolean) trong `selectPayload`. Trong khi `ChatWindow.jsx` và `useChatMessages.js` gọi `.length`, `.find()`, `.some()` trên `activeChat.members`. Việc gán boolean làm Javascript ném TypeError runtime crash khi gửi tin nhắn hoặc hiển thị số thành viên.

**Fix**:
- Backend (`sidebarController.js`): Thay `displayName` thành `name` trong `Group.find().select("name avatar members admin")`, map `target.displayName = g.name` và `target.members = (g.members || []).map(id => ({ _id: id }))`.
- Frontend (`Sidebar.jsx`): Map `members: conv.target?.members || []` trong `selectPayload`.

**Prevention**:
- Kiểm tra chính xác Mongoose Schema field names khi viết `.select(...)` query.
- Kiểm tra các type contract/type assumption (`Array` vs `Boolean`) tại nơi tiêu thụ object trong UI components.

**Related files**:
- `server/src/models/Group.js`
- `server/src/controllers/sidebarController.js`
- `client/src/components/layout/Sidebar.jsx`
- `client/src/features/chat/components/ChatWindow.jsx`
- `client/src/features/chat/hooks/useChatMessages.js`

## Flashing Empty State UI on Sidebar Tab Switching

**Symptom**: Khi chuyển tab giữa Tất cả -> Cá nhân -> Nhóm, UI bị nháy hiển thị giao diện Empty State ("Chưa có cuộc trò chuyện...", nút "Tạo nhóm mới") vài trăm ms trong lúc chờ fetch dữ liệu từ API.

**Root cause**: Trong `Sidebar.jsx`, điều kiện render list là `{conversations.length > 0 ? (...) : renderEmptyState()}`. Khi user chuyển tab, `useSidebarState.setFilter()` lập tức reset `conversations = []` và đặt `isFetching = true`. Việc không kiểm tra `isFetching` khiến React render `renderEmptyState()` ngay lập tức trong khoảng thời gian request pending.

**Fix**: Thêm `renderSkeletonLoader()` (dạng placeholder mờ giật nhè nhẹ) và đổi điều kiện render thành: `{conversations.length > 0 ? (...) : isSearching ? renderSkeletonLoader() : renderEmptyState()}`.

**Prevention**: Khi reset danh sách về mảng rỗng trước khi fetch async, luôn phải check flag loading/fetching trước khi fallback render Empty State UI.

**Related files**:
- `client/src/components/layout/Sidebar.jsx`
- `client/src/features/chat/hooks/useSidebarState.js`

## Disconnected Socket Hook for Unified Sidebar Real-time Updates

**Symptom**: Khi User B gửi tin nhắn mới cho User A, Sidebar hiển thị danh sách hội thoại phía User A không tự động cập nhật preview tin nhắn cuối cùng (`lastMessage`) của User B theo thời gian thực mà phải F5 / refresh trang mới thấy.

**Root cause**: Hook `useMessageSocket.js` lắng nghe sự kiện socket `getMessage` ở top-level nhưng chỉ cập nhật các mảng state legacy cũ (`users` và `groups`). Hook chưa truyền dữ liệu socket tới `sidebarState.handleSocketMessage(data)` của Unified Sidebar (`SidebarStateManager`).

**Fix**:
- Thêm tham số `onSocketMessage` vào `useMessageSocket` hook.
- Trong `ChatPage.jsx`, truyền `onSocketMessage: (data) => sidebarState.handleSocketMessage(data, ...)` vào `useMessageSocket`.

**Prevention**: Khi xây dựng UI state manager mới (như `SidebarStateManager`), luôn kiểm tra và wire callback socket event tương ứng tại top-level Container/Page (`ChatPage.jsx`) để đảm bảo state manager mới nhận được dữ liệu realtime.

## Sidebar API Fetch Called Before Auth Bootstrap Completion

**Symptom**: Khi ứng dụng khởi chạy (`ChatPage`), Sidebar hiển thị mảng rỗng `conversations = []` vĩnh viễn và không nạp được danh sách cuộc trò chuyện.

**Root cause**: `useSidebarState()` tự động gọi `manager.init()` trong `useEffect` ngay khi component mount (lúc `isChecking === true` và token chưa có trong bộ nhớ). API `/api/sidebar/conversations` trả về lỗi 401. Sau khi `bootstrapAuth` hoàn tất (`isChecking = false`), `useSidebarState()` thiếu cờ `enabled` / dependency nên không tự nạp lại dữ liệu.

**Fix**:
- Thêm cờ `options.enabled = true` vào `useSidebarState`. Trong `useEffect`, kiểm tra `if (!enabled) return;` và đưa `enabled` vào dependency array.
- Trong `ChatPage.jsx`, truyền `enabled: !isChecking && isAuthenticated && Boolean(token)` khi gọi `useSidebarState(...)`.

**Prevention**: Mọi hook thực hiện gọi API tự động (như `useSidebarState`) ở top-level container phải nhận cờ `enabled` phản ánh trạng thái auth ready trước khi gửi HTTP request.

## Unread Count Badge Retained On Unified Sidebar Upon Selecting Active Chat

**Symptom**: Khi người dùng click chọn một cuộc trò chuyện trên Sidebar (`handleSelectUser`), khung chat window bên phải đã được mở nhưng huy hiệu màu đỏ báo chưa đọc (`unreadCount > 0`) trên item Sidebar đó vẫn giữ nguyên không xóa thành 0.

**Root cause**: `handleSelectUser` trong `ChatPage.jsx` chỉ xóa `unreadCount` trên các mảng state legacy cũ (`setUsers` và `setGroups`), chưa hề gọi lệnh xóa chưa đọc tới `sidebarState` (`SidebarStateManager`). Đồng thời `SidebarStateManager` cũng chưa có hàm `markConversationRead`.

**Fix**:
- Thêm phương thức `markConversationRead(targetIdOrConvId)` vào `SidebarStateManager` và xuất ra `useSidebarState` hook. Hàm này tự tìm item khớp ID và set `unreadCount = 0` cũng như `lastMessage.isRead = true`.
- Trong `ChatPage.jsx` tại `handleSelectUser`, gọi `sidebarState.markConversationRead(user._id || user.conversationId)`.

**Prevention**: Khi chuyển đổi giao diện sang State Manager mới, mọi sự kiện hành động của user (như đọc tin, chọn chat, xóa lịch sử) làm thay đổi badge state phải đồng thời gửi tín hiệu tới State Manager mới.

## Conversation Retained On Unified Sidebar After Deleting History

**Symptom**: Khi người dùng xóa lịch sử cuộc trò chuyện từ Conversation Panel (`handleDeleteHistory`), cuộc trò chuyện đó vẫn tiếp tục xuất hiện trên Sidebar bên trái.

**Root cause**: `handleDeleteHistory` và `handleLeaveGroup` trong `ChatPage.jsx` chỉ tải lại dữ liệu cho hai mảng state legacy cũ (`setUsers` và `setGroups`), chưa hề gọi lệnh loại bỏ conversation tới `sidebarState` (`SidebarStateManager`). Đồng thời `SidebarStateManager` cũng chưa có hàm `removeConversation`.

**Fix**:
- Thêm phương thức `clearHistory(targetIdOrConvId)` vào `SidebarStateManager` để đặt `lastMessage = null`, `lastMessageAt = null`, `unreadCount = 0` (giữ lại đối tượng cuộc trò chuyện trong mảng để hỗ trợ tìm kiếm).
- Trong `SidebarStateManager.getDisplayedConversations()`, ở chế độ xem mặc định (`searchTerm` rỗng), tự động ẩn các cuộc trò chuyện chưa ghim (`!isPinned`) và không có tin nhắn (`!lastMessage`). Khi người dùng gõ từ khóa tìm kiếm (`searchTerm` có chữ), hiển thị lại tất cả các kết quả tìm kiếm tương ứng.
- Trong `ChatPage.jsx` tại `handleDeleteHistory`, gọi `sidebarState.clearHistory(convId)`.

**Prevention**: Khi xóa lịch sử cuộc trò chuyện, không purge hẳn object khỏi mảng client mà dùng `clearHistory` kết hợp với bộ lọc hiển thị thông minh (`!lastMessage` trong default view) để đảm bảo tính năng Tìm kiếm vẫn tìm ra được bạn bè / nhóm.

## Active Search Query Omitted During Tab Switch In SidebarStateManager

**Symptom**: Khi ô Tìm kiếm đang có từ khóa (ví dụ "Group A") ở tab "Tất cả", nếu người dùng bấm chuyển sang tab "Nhóm", từ khóa vẫn giữ nguyên trên thanh search nhưng danh sách cuộc trò chuyện bên dưới lại rỗng.

**Root cause**: Khi bấm chuyển tab, `setFilter(newFilter)` kích hoạt `fetchData(signal)`. Hàm `fetchData` chỉ đính kèm `params.kind` mà không đính kèm `params.q = this.searchTerm.trim()`, dẫn đến server trả về 20 item phân trang mặc định và client không tìm thấy kết quả matching ở tab mới.

**Fix**:
- Trong `SidebarStateManager.fetchData(signal)`, kiểm tra `if (this.searchTerm && this.searchTerm.trim()) { params.q = this.searchTerm.trim(); }` để tự động truyền `q` lên API trong mọi đợt fetch dữ liệu khi search đang active.

**Prevention**: Mọi yêu cầu gọi API tải dữ liệu danh sách khi giao diện đang ở trạng thái tìm kiếm phải luôn kiểm tra và giữ lại query parameter `q`.

## Group Socket Message Avatar Fallback In SidebarStateManager

**Symptom**: Khi B ở tab "Nhóm" nhận được tin nhắn từ A gửi vào nhóm (sau khi xóa lịch sử trò chuyện), cuộc trò chuyện nhóm hiển thị lại trên Sidebar nhưng avatar bị nhầm thành avatar cá nhân của A.

**Root cause**: Khi tạo lại target object cho tin nhắn socket nhóm chưa có trong memory, client `useSidebarState.js` fallback `avatar: senderAvatar`. Đồng thời backend `messageHandler.js` bỏ quên đính kèm `groupAvatar` trong socket payload `getMessage`.

**Fix**:
- Tại backend `messageHandler.js`: Bổ sung `select("name displayName avatar")` và đính kèm `payloadToEmit.groupAvatar`.
- Tại client `useSidebarState.js`: Khi `isGroup === true`, gán `avatar: data.groupAvatar || data.group?.avatar || ""` (không bao giờ dùng `senderAvatar` cho nhóm).

**Prevention**: Khi xử lý dữ liệu socket cho cuộc trò chuyện nhóm, tuyệt đối không gán `avatar` của sender làm avatar của nhóm.

## Search Term Clear Auto-Refetch In SidebarStateManager

**Symptom**: Khi người dùng đang ở tab "Nhóm" với từ khóa tìm kiếm "B" (đang hiển thị "Không tìm thấy nhóm nào"), nếu xóa từ khóa "B" về rỗng `""`, giao diện hiển thị "Bạn chưa tham gia nhóm chat nào" thay vì tự nạp lại nhóm "ALOO".

**Root cause**: Trong `useSidebarState.js`, hàm `setSearchTerm(term)` khi nhận `term = ""` chỉ gán `this.searchTerm = ""` mà không kích hoạt `fetchData()` nạp lại danh sách mặc định của tab hiện tại, khiến mảng `this.conversations` bị giữ nguyên mảng rỗng `[]` của đợt tìm kiếm trước.

**Fix**:
- Trong `SidebarStateManager.setSearchTerm(term)`: Kiểm tra `else if (prevTrimmed.length > 0)` khi chuyển từ từ khóa có chữ về rỗng `""`, thực hiện reset `cursor = null`, `conversations = []` và gọi `this.fetchData(signal)` để tự động nạp lại danh sách mặc định của tab hiện tại từ server.

**Prevention**: Khi xóa từ khóa tìm kiếm về rỗng `""`, phải tự động kích hoạt nạp lại danh sách cuộc trò chuyện mặc định cho tab đang active.

## Realtime Online Presence Check After Clearing Chat History

**Symptom**: Khi B xóa lịch sử cuộc trò chuyện với bạn bè A rồi B tìm kiếm lại A, Sidebar và Conversation Panel không hiển thị chấm xanh (online dot) của A mặc dù A đang online.

**Root cause**:
1. Trong `Sidebar.jsx`, hàm `isTargetOnline(conv)` chỉ kiểm tra dữ liệu tĩnh DB `conv.target.isOnline` mà không kiểm tra mảng realtime `onlineUsers` từ Socket Context.
2. Trong `ConversationPanel.jsx`, hàm `getPartnerUserId()` bị lấy nhầm conversation ObjectId khi `conversationId` không chứa dấu `_`, khiến `onlineUsers.some` so sánh nhầm ID.

**Fix**:
- Tại `Sidebar.jsx`: Bổ sung kiểm tra `onlineUsers.some(u => String(u.userId) === String(targetId))` từ Socket Context.
- Tại `ConversationPanel.jsx`: Cập nhật `getPartnerUserId()` ưu tiên lấy `activeChat?.target?._id || activeChat?._id || metadata?.overview?.targetId`.

**Prevention**: Mọi vị trí hiển thị trạng thái online cá nhân đều phải kiểm tra danh sách `onlineUsers` từ Socket Context với chính xác User ID của đối phương.

## Incorrect useSocket Import Path In Sidebar.jsx

**Symptom**: Trình duyệt báo lỗi `Uncaught SyntaxError: The requested module '/src/services/socket/SocketProvider.jsx' does not provide an export named 'useSocket'`.

**Root cause**: Hook `useSocket` được export từ `SocketContext.js`, không phải từ `SocketProvider.jsx`.

**Fix**:
- Trong `Sidebar.jsx`: Đổi `import { useSocket } from "@/services/socket/SocketProvider.jsx"` thành `import { useSocket } from "@/services/socket/SocketContext.js"`.

**Prevention**: Kiểm tra chính xác vị trí export của custom hooks trong codebase trước khi import.

## Stale Conversation Target In Search Results & UserStatus Override

**Symptom**: Sau khi B xóa lịch sử cuộc trò chuyện với A, khi B tìm kiếm lại A và mở conversation, trạng thái "Đang hoạt động" không hiển thị ở Header và Sidebar.

**Root cause**:
1. Trong `useSidebarState.js`, `fetchSearchData(term)` không merge dữ liệu `target` mới từ backend cho các cuộc trò chuyện đã có sẵn trong memory.
2. Trong `UserStatus.jsx`, biến `isActive` dùng ternary `isOnline !== undefined ? isOnline : ...` đè `isActive = false` khi `isOnline` của socket trả về false, bỏ qua thông tin `user.isOnline` hoặc `user.activityStatus` tươi từ backend.

**Fix**:
- Trong `useSidebarState.js`: Cập nhật `fetchSearchData` để merge `sc.target` vào `existing.target` khi conversation đã tồn tại.
- Trong `UserStatus.jsx`: Cập nhật `isActive = Boolean(isOnline || user?.isOnline || user?.activityStatus?.state === "active" || user?.activityStatus?.state === "online")`.
- Trong `ConversationPanel.jsx`: Thêm fallback `activeChat?.isOnline || activeChat?.activityStatus` vào `isPartnerOnline`.

**Prevention**: Kết quả tìm kiếm từ server phải luôn merge lại thông tin `target` mới cho danh sách memory hiện có, và các component status phải OR các nguồn thông tin online thay vì cho phép cờ rỗng đè mất dữ liệu tươi.

## Missing isOnline In Sidebar selectPayload & ChatPage handleSelectUser

**Symptom**: Sau khi chọn cuộc trò chuyện từ Sidebar, Sidebar hiển thị chấm xanh nhưng thanh Header và Details Panel không hiển thị "Đang hoạt động" / chấm xanh online.

**Root cause**: Đối tượng `selectPayload` trong `Sidebar.jsx` khi truyền cho `handleSelectUser` thiếu hai thuộc tính `isOnline` và `activityStatus`, làm cho `activeChat` nhận được object thiếu cờ online.

**Fix**:
- Trong `Sidebar.jsx`: Đính kèm `isOnline: online` và `activityStatus: conv.target?.activityStatus` vào `selectPayload`.
- Trong `ChatPage.jsx`: Trong `handleSelectUser`, chủ động làm giàu `user` với `isOnline: Boolean(onlineUsers.some(...) || user.isOnline || user.activityStatus?.state === "active")` trước khi đặt `setActiveChat`.
- Trong `ChatWindow.jsx`: Cập nhật `isOnline={checkIsOnline(currentChatUser) || currentChatUser?.isOnline || currentChatUser?.activityStatus?.state === "active"}`.

**Prevention**: Đối tượng payload khi chọn item từ Sidebar và handler `handleSelectUser` phải luôn bảo tồn và làm giàu cờ trạng thái online `isOnline` cho `activeChat`.

## ChatWindow shouldShowOnlineStatus Hiding Header UserStatus Component

**Symptom**: Thanh Header bên phải bị ẩn hoàn toàn (không render) dòng hiển thị "Đang hoạt động" khi nhấp chọn cuộc trò chuyện cá nhân từ Sidebar.

**Root cause**: Trong `ChatWindow.jsx`, `shouldShowOnlineStatus = !isGroupChat && Boolean(currentChatUser?.isFriend)` dùng `Boolean(isFriend)`. Khi dữ liệu từ Sidebar chưa truyền `isFriend` (trả về `undefined`), `Boolean(undefined)` bằng `false`, làm cho `UserStatus` bị ẩn hoàn toàn.

**Fix**:
- Trong `ChatWindow.jsx`: Đổi `shouldShowOnlineStatus = !isGroupChat && currentChatUser?.isFriend !== false`.
- Trong `Sidebar.jsx`: Đính kèm `isFriend: conv.target?.isFriend !== false` trong `selectPayload`.
- Trong `ChatPage.jsx`: Đính kèm `isFriend: user?.isFriend !== false` trong `handleSelectUser`.

**Prevention**: Tránh dùng `Boolean(prop)` cho các thuộc tính optional khi kiểm tra điều kiện hiển thị header; sử dụng `prop !== false` để giữ mặc định hiển thị cho cuộc trò chuyện cá nhân.
















## Unified Sidebar Search Must Include Global Non-Friends

**Symptom**: Ô tìm kiếm Unified Sidebar chỉ trả về người đã có Conversation. Người dùng chưa kết bạn và chưa từng nhắn tin không xuất hiện, nên không thể gửi lời mời kết bạn từ kết quả tìm kiếm.

**Root cause**: Quá trình migration sang Unified Sidebar chưa nối lại luồng global user search. UI dùng `sidebarState.searchTerm` và `sidebarState.conversations`, trong khi hook legacy `useSearch()` gọi `/api/users/search` nhưng kết quả `usersToDisplay` không còn được render. Endpoint `/api/sidebar/conversations?q=...` chỉ tìm trong Conversation read model nên không thể trả về người chưa có conversation.

**Reproduction**:

```powershell
node -e 'const fs=require("fs"); const chat=fs.readFileSync("src/features/chat/pages/ChatPage.jsx","utf8"); const state=fs.readFileSync("src/features/chat/hooks/useSidebarState.js","utf8"); const usesGlobalSearch=chat.includes("usersToDisplay") && chat.includes("conversations={usersToDisplay}"); const managerSearchesUsers=state.includes("searchUsers") || state.includes("fetchUsersApi"); if(!usesGlobalSearch && !managerSearchesUsers){process.exit(1)}'
```

**Fix**:
- `SidebarStateManager` tìm conversation và global user song song, bỏ qua global user search ở filter `group`.
- Merge và dedupe global users theo `target._id`; tạo transient direct rows cho người chưa có conversation.
- Dùng request ID để loại stale response khi đổi từ khóa/filter và cô lập lỗi của hai API để một nguồn lỗi không che nguồn còn lại.
- `Sidebar.jsx` hiển thị trạng thái/lời mời kết bạn và chặn mở chat đối với transient non-friend rows.

**Prevention**:
- Khi thay UI sang state manager/read model mới, lập checklist toàn bộ producer và consumer của state legacy; không chỉ kiểm tra endpoint chính.
- Với search tổng hợp từ nhiều nguồn, giữ test cho: entity chưa tồn tại trong read model, dedupe, filter-specific behavior, stale response và partial API failure.
- Không giả định Conversation search có thể thay thế User directory search; đây là hai seam có phạm vi dữ liệu khác nhau.

**Related architecture**:
- `docs/adr/006-unified-sidebar-conversations.md`


## Conversation Panel Resource Previews Need Their Own Message Listener

**Symptom**: Khi Conversation Panel đang mở, tin nhắn mới chứa ảnh, video, file hoặc link xuất hiện trong khung chat nhưng resource preview trong panel không cập nhật cho tới khi đóng/mở lại panel hoặc refresh trang.

**Root cause**: Panel chỉ tải media/files/links một lần qua `loadedConvIdRef`. Socket effect của `ConversationPanel` chỉ đăng ký các event lifecycle của group và không nghe `getMessage`. Listener trung tâm `useMessageSocket` cập nhật chat/sidebar nhưng không phát state update cho panel.

**Reproduction**:

```powershell
node -e 'const fs=require("fs"); const source=fs.readFileSync("src/features/chat/components/ConversationPanel.jsx","utf8"); const hasMessageListener=source.includes("socket.on(\"getMessage\""); const hasConversationGuard=source.includes("getRealtimePanelResourceScopes({"); if(!hasMessageListener || !hasConversationGuard){process.exit(1)}'
```

**Fix**:
- Thêm classifier thuần xác định message thuộc conversation đang mở và trả về các scope `media`, `files`, `links` bị ảnh hưởng.
- `ConversationPanel` đăng ký/cleanup listener `getMessage` và chỉ refetch loader của scope phù hợp.
- Resource loaders dùng `useCallback` để socket effect không giữ stale closure.
- Mixed message có thể refresh nhiều scope; unrelated conversation không tạo request.

**Prevention**:
- Mỗi realtime consumer phải đăng ký hoặc nhận signal rõ ràng; không giả định một listener cập nhật chat/sidebar sẽ tự cập nhật panel/explorer.
- Test socket lifecycle phải khóa cả `socket.on` và `socket.off` để tránh duplicate handlers.
- Với resource preview, dùng scoped refetch từ backend thay vì chèn raw socket payload có schema khác DTO của Resources API.
- Bao phủ direct, group, mixed attachments và unrelated conversation trong regression tests.

**Related architecture**:
- `docs/adr/005-conversation-panel-two-stage-loading.md`
- `.agents/rules/realtime-state.md`
