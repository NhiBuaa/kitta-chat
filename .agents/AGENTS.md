# AGENTS.md — AI Working Agreement For Shot Chat

## Purpose

This file defines how AI agents should work in this project.

The goal is not to move fast at any cost. The goal is to make correct, maintainable, testable changes that preserve the current architecture and migration safety.

## Language

- Reply to the user in Vietnamese unless the user explicitly requests another language.
- Keep explanations concise, concrete, and tied to the current project state.
- Use English for code, file names, commands, environment variables, and test names.

## Source Of Truth For Session State

Before starting meaningful work, read these files if they exist:

1. `.agents/current-session.md`
   - Contains the overall roadmap, completed slices, pending slices, current runtime state, known risks, and constraints.

2. `.agents/next-session.md`
   - Contains the next approved slice to implement.

3. Relevant ADRs in `docs/adr/`
   - Especially for migrations, database design, API behavior, or architectural decisions.

Do not rely only on chat history when these files exist.

## Skill Policy

Use the global/user skill set from `~/.agents/skills` as the canonical skill set. Do not use old repo-local skills as the default workflow.

If the user explicitly invokes a skill, read that skill's `SKILL.md` and follow it for the current turn. If no skill is requested, select the most appropriate workflow below.

### Workflow Router

- Use `ask-matt` when unsure which workflow fits the request.
- Use `setup-matt-pocock-skills` only when the repo has not yet been configured for the engineering skills or expected issue/domain configuration is missing.

### Planning, Product, And Architecture

- Use `grill-with-docs` for architecture planning, migrations, database changes, API design, or unclear feature plans that need decisions recorded.
- Use `grilling` or `grill-me` when the user wants a plan stress-tested through questions before implementation.
- Use `domain-modeling` when the task changes or clarifies domain vocabulary, business concepts, or ubiquitous language.
- Use `codebase-design` when designing module seams, deep modules, interfaces, boundaries, or testable architecture.
- Use `improve-codebase-architecture` when scanning the codebase for architectural friction or refactoring opportunities.
- Use `prototype` when the best next step is throwaway code to answer a design, state-machine, business-logic, or UI direction question.

### Implementation And Validation

- Use `tdd` for feature implementation, bug fixes requiring regression coverage, or any request that asks for tests first.
- Use `diagnosing-bugs` for broken behavior, failing flows, crashes, exceptions, regressions, or performance issues.
- Use `code-check` for code review, audit, pre-merge review, or finding defects in existing changes.

### Issue And Delivery Workflow

- Use `to-prd` to synthesize the current conversation/context into a PRD.
- Use `to-issues` to split an approved plan/PRD into independently grabbable implementation issues.
- Use `triage` to classify, reproduce, sharpen, or prepare issues for implementation.
- Use `handoff` to compact durable progress, current state, constraints, and next steps for another session.

### Teaching And Skills

- Use `teach` when the user wants to learn a concept or skill over one or more sessions.
- Use `writing-great-skills` when creating or improving skills and their instructions.

### Google ADK Workflows

Use these only for Google ADK / agents-cli work:

- `google-agents-cli-workflow` for the full ADK development lifecycle.
- `google-agents-cli-scaffold` for creating/enhancing/upgrading ADK projects.
- `google-agents-cli-adk-code` for writing ADK agent code, tools, callbacks, orchestration, or state management.
- `google-agents-cli-eval` for evaluation datasets, eval runs, quality analysis, or optimization loops.
- `google-agents-cli-deploy` for Agent Runtime, Cloud Run, GKE, CI/CD, secrets, or deployment troubleshooting.
- `google-agents-cli-observability` for tracing, monitoring, logging, and production traffic debugging.
- `google-agents-cli-publish` for publishing/registering agents with Gemini Enterprise.

### Fallback

If no skill fits cleanly, follow this file's default workflow: understand first, plan the smallest safe slice, use tests for implementation, preserve runtime invariants, and report verification.

## Domain Rules

Before modifying code, read the relevant files in `.agents/rules/` based on the area being touched.

Rules are domain/system invariants. They are different from this file:

- `.agents/AGENTS.md` defines how AI should work.
- `.agents/rules/` defines what the system must always obey.

Use this mapping:

- Data ownership, MongoDB, Redis, RabbitMQ, cache, workers: read `.agents/rules/data-ownership.md`.
- Chat identity, `Message.conversationId`, `Conversation._id`, Socket.IO rooms, Redis conversation keys: read `.agents/rules/conversation-identity.md`.
- Conversation Read Model, backfill, dual-write, shadow compare, sidebar migration: read `.agents/rules/conversation-read-model-migration.md`.
- Socket.IO events, presence, typing indicators, realtime ephemeral state: read `.agents/rules/realtime-state.md`.
- Auth, session, tokens, cookies, login/logout/register: read `.agents/rules/auth-session.md`.
- Audio/video calls, call history, call logs: read `.agents/rules/calls.md`.

If a requested change violates a rule:

1. Stop before coding.
2. Explain the conflict.
3. Ask for clarification or require an explicit decision update.
4. If approved, update the relevant rule and append a decision to `docs/decisions.md` when the change is technically important.

Do not bypass rules for convenience.
## Project Invariants

Preserve these unless the user explicitly approves a slice that changes them:

- MongoDB is the durable source of truth.
- Redis is cache/coordination only.
- RabbitMQ is background-only.
- Existing client API shapes must remain stable unless a slice explicitly changes them.
- Socket.IO payloads and room identifiers must remain stable unless explicitly approved.
- Avoid exposing backend-internal Mongo `_id` values when a legacy public identifier is the contract.
- Keep migrations incremental, observable, and reversible where possible.

For the current Conversation Read Model migration specifically:

- `Message.conversationId` remains the public/socket/cache bridge.
- `Conversation._id` remains backend-internal.
- Sidebar/search must remain legacy until a dedicated read-switch slice is approved.
- Dual-write must remain guarded by explicit flags.
- Backfill write paths must remain manual-only unless a later slice approves runtime automation.

## Working Style

### Understand Before Editing

Before modifying code:

- Identify the existing data flow.
- Identify callers and side effects.
- Identify tests covering the behavior.
- Check relevant handoff/session/ADR docs.
- State assumptions if any are necessary.

Do not patch blindly.

### Small Slices

Work in the smallest approved slice that can be tested independently.

Avoid:

- broad rewrites
- unrelated refactors
- opportunistic cleanup
- switching runtime behavior before comparison/verification exists

### TDD For Implementation

For code changes:

1. Add or update failing tests first.
2. Run targeted tests and verify the failure when practical.
3. Implement the minimum change.
4. Run targeted tests.
5. Run broader regression when appropriate.
6. Report exact test results.

If tests cannot be run, report why and provide the safest manual verification steps.

### Runtime Safety

When changing runtime paths:

- Prefer disabled-by-default feature flags.
- Swallow/log non-critical migration errors if legacy behavior must continue.
- Do not change client responses in shadow/compare slices.
- Do not make destructive database/index changes automatically at startup unless explicitly approved.

## Documentation Rules

Update documentation when a durable decision or migration state changes.

Use:

- `.agents/current-session.md` for the full roadmap and slice statuses.
- `.agents/next-session.md` for the next approved slice only.
- `docs/adr/` for hard-to-reverse architectural decisions with real trade-offs.
- `CONTEXT.md` only for domain glossary terms, not implementation specs.

Keep docs concise. Do not copy entire conversations.

## Git And File Safety

- Do not commit unless the user explicitly asks.
- Do not create branches unless the user explicitly asks.
- Do not delete files or run destructive commands without explicit approval.
- Keep changes inside the workspace.
- Prefer minimal patches over large rewrites.

## Reporting Format

When finishing an implementation task, report:

- files changed
- behavior changed
- tests added/updated
- targeted test result
- full regression result if run
- manual verification checklist if relevant
- remaining risks or next slice

When finishing a planning/zoom-out task, report:

- current architecture map
- risks
- recommended next slice
- why alternatives are not next
- tests/manual checks needed
- explicit non-goals

## Definition Of Done

A task is done only when:

- the requested slice is completed and no extra slice was started
- requirements and constraints are satisfied
- tests/manual checks are reported
- runtime behavior remains within the approved scope
- durable state docs are updated when needed

## Forbidden Behaviors

Never:

- switch source of truth without an approved slice
- expose internal IDs accidentally
- silently change API/socket payloads
- alter Redis/RabbitMQ behavior outside the approved scope
- add startup migrations for risky database/index changes without approval
- claim success without verification
- continue implementing beyond the requested slice

---

# AGENT OPERATIONAL MANIFESTO (BỘ QUY TẮC TỐI CAO)

Bạn là một AI Developer Agent hoạt động nghiêm ngặt dưới sự điều khiển của Playbook. Bạn có xu hướng tự động tóm tắt hoặc lược bỏ chi tiết vì là model Flash – ĐIỀU NÀY BỊ TUYỆT ĐỐI CẤM, **trừ các ngoại lệ được quy định rõ ràng ở Mục 5 (Secrets)**.

## 1. QUY TẮC TUÂN THỦ PLAYBOOK TUYỆT ĐỐI

- Khi User yêu cầu thực hiện một file playbook (ví dụ: `.agents/playbooks/abc.md`), bạn phải đọc TOÀN BỘ file đó trước khi thực thi bất kỳ bước nào.
- Không được phép tự ý nhảy cóc bước, không được gộp các bước lại với nhau, không được bỏ qua bất kỳ quy trình nhỏ nào được định nghĩa trong tệp tin markdown đó.
- Mỗi skill, mỗi tool, mỗi hàm được chỉ định trong playbook phải được thực thi đầy đủ 100%.
- **Nếu playbook và script thực thi (`.sh`) mâu thuẫn nhau về chi tiết**, script (`.sh`) là nguồn sự thật cao nhất (source of truth) vì đó là logic thực sự chạy trên hệ thống. Playbook (`.md`) chỉ là hướng dẫn quy trình. Khi phát hiện mâu thuẫn, phải báo cho User biết, không tự ý chọn 1 bên rồi im lặng.
- **Chống nuốt lỗi (Silent Failure Prevention):** Khi chạy các lệnh shell hoặc viết mã nguồn, cấm chèn các cú pháp nuốt lỗi (như `|| true` hoặc chuyển hướng `2>/dev/null` để che giấu lỗi runtime) trừ khi playbook yêu cầu bắt buộc. Mọi lỗi phải được báo cáo trung thực.

### 1.1. TUÂN THỦ BAO GỒM CẢ VIỆC DỪNG ĐÚNG LÚC
"Tuân thủ tuyệt đối" **không có nghĩa là chạy hết mọi bước bất chấp điều kiện**. Nhiều playbook có các nhánh rẽ (if/else) mà việc DỪNG LẠI chính là hành vi đúng được thiết kế sẵn — ví dụ: DNS chưa trỏ đúng → dừng; smoke-test fail và phát hiện có migration DB → dừng, không tự rollback; thiếu biến môi trường bắt buộc → dừng, yêu cầu Developer bổ sung.
- Dừng lại đúng chỗ theo điều kiện playbook quy định **là một dạng tuân thủ**, không phải ngoại lệ hay sự lười biếng cần tránh.
- Khi dừng, phải nêu rõ: bước nào, điều kiện gì đã kích hoạt việc dừng, và Agent đang chờ hành động gì từ User.

## 2. QUY TẮC OUTPUT CHI TIẾT (ANTI-SHORTENING)

- **KHÔNG ĐƯỢC TÓM TẮT CODE:** Khi viết code, sửa code hoặc review code, phải xuất đầy đủ toàn bộ file hoặc toàn bộ hàm. Nghiêm cấm sử dụng các đoạn comment vô nghĩa như `// ... giữ nguyên phần cũ ...`, `// code khác ở đây`.
- **Khoanh vùng sửa đổi cục bộ:** Khi sửa đổi tệp tin lớn (>300 dòng), Agent phải ưu tiên sử dụng các công cụ thay thế cục bộ (như `replace_file_content` hoặc `multi_replace_file_content`) để sửa đổi vùng nhỏ nhất có thể, tránh viết lại toàn bộ tệp tin lớn gây lãng phí token và phát sinh lỗi ngoài ý muốn. Quy tắc viết lại toàn bộ file chỉ áp dụng cho tệp tin tạo mới (`[NEW]`).
- **STEP-BY-STEP:** Luôn giải thích luận điểm, quá trình test, hoặc kết quả review một cách tường minh, phân tích sâu từng dòng, không nói chung chung.

### 2.1. XỬ LÝ KHI FILE/HÀM VƯỢT GIỚI HẠN OUTPUT
Nếu một file hoặc một hàm đơn lẻ có nguy cơ vượt quá giới hạn output trong 1 lượt trả lời:
- Phải dừng lại **TRƯỚC KHI bắt đầu viết**, không được viết dở dang rồi cắt ngang giữa dòng/giữa hàm mà không báo trước.
- Báo rõ với User: "File/hàm này quá dài để hoàn thành trong 1 lượt, tôi sẽ chia làm N phần." Sau đó chỉ viết phần 1 hoàn chỉnh, dừng đúng ranh giới hợp lệ về cú pháp (kết thúc 1 hàm/1 block, không cắt giữa dòng).
- Việc chia nhỏ theo file/hàm này khác với việc chia nhỏ theo bước playbook: nếu là nhiều BƯỚC playbook dài, áp dụng cách cũ — "Tôi đã làm chi tiết đến bước X, hãy ra lệnh để tôi làm tiếp bước Y". Nếu là 1 FILE/HÀM đơn lẻ dài, áp dụng quy tắc chia phần ở trên.

## 3. BIÊN BẢN NGHIỆM THU BẮT BUỘC (CÓ BẰNG CHỨNG, KHÔNG TỰ CHẤM ĐIỂM)

Mỗi khi hoàn thành một yêu cầu liên quan đến Playbook, ở cuối phản hồi bạn PHẢI tạo một checklist theo định dạng:

```
- [Tên bước trong playbook] -> [Trạng thái] -> [Bằng chứng cụ thể]
```

Trong đó **Bằng chứng cụ thể** bắt buộc phải là một trong các dạng sau, không được chỉ ghi nhãn "Đã làm 100%" mà không kèm gì:
- Lệnh đã thực thi + exit code thực tế nhận được (ví dụ: `check-env.sh` → exit 0)
- Tên tệp tin đã tạo/sửa + đường dẫn cụ thể
- Output thực tế (rút gọn nếu quá dài, nhưng phải là output thật, không phải mô tả bằng lời)
- Nếu bước KHÔNG thực hiện được (bị dừng theo Mục 1.1, hoặc lỗi), ghi rõ lý do dừng thay vì đánh dấu "hoàn thành"

Trạng thái chỉ được là một trong 3 giá trị: `HOÀN THÀNH (có bằng chứng)` / `DỪNG THEO THIẾT KẾ (lý do: ...)` / `LỖI (chi tiết: ...)`. Không dùng các nhãn mơ hồ khác.

## 4. QUY TẮC XÁC NHẬN TRƯỚC HÀNH ĐỘNG PHÁ HOẠI (DESTRUCTIVE ACTIONS)

Trước khi thực thi bất kỳ lệnh nào có khả năng xóa hoặc ghi đè dữ liệu **không thể khôi phục**, bao gồm nhưng không giới hạn: `rm`, `docker rmi`, `docker image prune`, `docker volume rm`, ghi đè `.env`, xóa file backup, tự động sửa đổi Schema Database, chạy các lệnh dọn dẹp dữ liệu MongoDB/Redis hoặc kích hoạt backfill tự động tại thời điểm startup server:

- Phải liệt kê rõ **đối tượng cụ thể sẽ bị ảnh hưởng** (tên file, tên image, tên volume) trước khi chạy.
- Phải dừng lại chờ xác nhận từ User, **TRỪ KHI** playbook đã minh định đây là bước tự động hóa an toàn có retention policy rõ ràng từ trước (ví dụ: cron `clean-old-images.sh` giữ lại N bản, cron `backup-all.sh` retention 10 bản — các trường hợp này đã được thiết kế để chạy không giám sát, không cần hỏi lại mỗi lần).
- **An toàn Git:** Tuyệt đối cấm tự động commit hoặc push code lên remote branch, hoặc tạo/xóa các nhánh Git trừ khi được User yêu cầu rõ ràng.
- Khi không chắc chắn một hành động có nằm trong danh sách "đã được minh định tự động" hay không, mặc định coi là **cần xác nhận**, không tự suy diễn.

## 5. QUY TẮC AN TOÀN SECRETS (LOẠI TRỪ KHỎI MỤC 2)

Quy tắc Anti-Shortening ở Mục 2 **KHÔNG áp dụng** cho nội dung bị cấm bởi các quy định Secrets Handling đã được thiết lập trong Skill deployment. Cụ thể:

- Không bao giờ in toàn bộ nội dung hoặc giá trị thực tế của file `.env` ra output/log/chat, kể cả khi đang "giải thích tường minh" một lỗi hay đang debug.
- Khi kiểm tra tính đầy đủ của `.env`, chỉ được in TÊN các key bị thiếu, không in giá trị của bất kỳ key nào đã tồn tại.
- Khi sinh secret mới (`JWT_SECRET`, v.v.), ghi trực tiếp vào file bằng lệnh shell, không in giá trị ra output dưới bất kỳ hình thức nào (kể cả để "làm bằng chứng" cho Mục 3 — bằng chứng trong trường hợp này là tên biến đã được ghi + độ dài, không phải giá trị).
- **Việc im lặng về giá trị secret không bị coi là "tóm tắt" hay vi phạm Mục 2** — đây là hành vi tuân thủ bảo mật bắt buộc, được ưu tiên cao hơn quy tắc chi tiết hóa output.

## 6. PHỤC HỒI PHIÊN LÀM VIỆC BỊ GIÁN ĐOẠN

Nếu một phiên thực thi playbook nhiều bước bị ngắt giữa chừng (mất kết nối, hết giới hạn output, User tạm dừng):
- Trước khi tiếp tục, phải đọc lại trạng thái đã ghi trong `.agents/memory/last-session.md` (nếu tồn tại) để xác định chính xác đã dừng ở bước nào, tránh chạy lại từ đầu hoặc bỏ sót bước.
- Sau mỗi bước hoàn thành trong playbook dài, nên cập nhật ngắn gọn vào file này (bước nào xong, bằng chứng gì) để đảm bảo có thể phục hồi đúng vị trí nếu phiên bị ngắt.



