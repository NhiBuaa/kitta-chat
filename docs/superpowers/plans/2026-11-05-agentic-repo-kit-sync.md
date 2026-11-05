# KittaChat — Agentic Repo Kit Synchronization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ hóa toàn diện cấu trúc quản trị, tài liệu, chuẩn UI/UX và công cụ kiểm chứng của Kitta-Chat theo Agentic Repo Kit mới nhất (commit `0ac239c`).

**Architecture:** Bổ sung các chuẩn UI governance (`DESIGN.md`, `ui-quality.md`, `ui-skill-routing.md`), 2 developer playbooks, tích hợp script kiểm chứng `check-kit.ps1`, chuẩn hóa metadata và sửa các link hỏng để pass 100% 4 pass kiểm thử.

**Tech Stack:** Markdown, PowerShell, Agentic Repo Kit conventions, React / Tailwind v4 design tokens.

**Spec:** [NhiBuaa/agentic-repo-kit](https://github.com/NhiBuaa/agentic-repo-kit) (commit `0ac239c`).

## Global Constraints
- Bảo toàn toàn bộ các nguyên tắc Single Source of Truth (SSoT) và kiến trúc ứng dụng kitta-chat.
- Không sửa code ứng dụng trong thư mục `client/` hoặc `server/`.
- Mọi tài liệu mới và sửa đổi phải pass toàn bộ 4 pass của `scripts/check-kit.ps1`.
- Thực hiện nghiêm ngặt trên worktree `C:/Developer/Projects/kitta-chat-worktrees/docs-agentic-repo-kit-sync` thuộc nhánh `docs/agentic-repo-kit-sync`.

---

### Task 1: Tích hợp công cụ kiểm tra toàn vẹn `scripts/check-kit.ps1`

**Files:**
- Create: `scripts/check-kit.ps1`

**Interfaces:**
- Consumes: `C:\Developer\Projects\agentic-repo-kit-reference\scripts\check-kit.ps1`
- Produces: `scripts/check-kit.ps1` có khả năng chạy độc lập trên Windows PowerShell và hỗ trợ bỏ qua an toàn các custom URI scheme (như `file:///`).

- [ ] **Step 1: Sao chép và cải tiến script `check-kit.ps1` vào `scripts/`**
Sao chép `check-kit.ps1` từ reference repo vào `scripts/check-kit.ps1`, đảm bảo dòng regex bỏ qua protocol bên cạnh `http/https/mailto/ftp` cũng bỏ qua hoặc xử lý an toàn `file:///` và `conversation://`.

- [ ] **Step 2: Chạy thử `scripts/check-kit.ps1` để xác minh cú pháp PowerShell hợp lệ**
Chạy: `powershell -ExecutionPolicy Bypass -File scripts/check-kit.ps1 -SkeletonOnly`
Kỳ vọng: Thực thi thành công, báo lỗi skeleton các file chưa bổ sung (playbooks, ui files) nhưng không crash unhandled exception.

---

### Task 2: Bổ sung 2 Developer Playbooks vào `docs/07-guides/`

**Files:**
- Create: `docs/07-guides/project-start-playbook.md`
- Create: `docs/07-guides/feature-development-playbook.md`
- Modify: `docs/07-guides/README.md`

**Interfaces:**
- Consumes: Templates từ `agentic-repo-kit` (`docs/07-guides/project-start-playbook.md` và `feature-development-playbook.md`)
- Produces: 2 playbooks chuẩn hóa quy trình khởi động dự án và phát triển tính năng cho lập trình viên và agent.

- [ ] **Step 1: Tạo `docs/07-guides/project-start-playbook.md`**
Đưa playbook khởi động dự án từ kit vào `docs/07-guides/project-start-playbook.md`.

- [ ] **Step 2: Tạo `docs/07-guides/feature-development-playbook.md`**
Đưa playbook phát triển tính năng từ kit vào `docs/07-guides/feature-development-playbook.md`.

- [ ] **Step 3: Cập nhật `docs/07-guides/README.md`**
Bổ sung liên kết đến 2 playbooks mới trong danh mục hướng dẫn.

- [ ] **Step 4: Chạy kiểm tra Pass 1 (Skeleton)**
Chạy: `powershell -ExecutionPolicy Bypass -File scripts/check-kit.ps1 -SkeletonOnly`
Kỳ vọng: Không còn thiếu các file playbook bắt buộc.

---

### Task 3: Thiết lập hệ thống Quản trị UI/UX (`DESIGN.md`, `ui-quality.md`, `ui-skill-routing.md`)

**Files:**
- Create: `DESIGN.md` (root)
- Create: `docs/04-standards/ui-quality.md`
- Create: `.agents/rules/ui-skill-routing.md`
- Modify: `docs/04-standards/README.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: `templates/DESIGN.md`, `templates/ui-quality.md`, `templates/ui-skill-routing.md` từ kit; bảng màu thực tế của kitta-chat (`#4CAF50` green, white/gray surfaces).
- Produces: Design token hoàn chỉnh, tiêu chuẩn UI/UX 4 giai đoạn, và quy tắc định tuyến skill UI cho agent.

- [ ] **Step 1: Tạo root `DESIGN.md` được may đo cho Kitta**
Định nghĩa đầy đủ YAML frontmatter với các token bắt buộc (`name`, `version`, `colors.primary: "#4CAF50"`, `colors.canvas: "#ffffff"`, `colors.surface-1: "#f8fafc"`, etc.) cùng tài liệu mô tả chi tiết typography, spacing, surface hierarchy, visual rhythm và icons (React-Icons).

- [ ] **Step 2: Tạo `docs/04-standards/ui-quality.md`**
Thiết lập chuẩn chất lượng UI/UX với 4 giai đoạn phát triển:
Stage 1: Layout & Visual Identity
Stage 2: Interaction Ergonomics & States
Stage 3: Runtime Inspection & Accessibility (a11y)
Stage 4: Performance Optimization

- [ ] **Step 3: Tạo `.agents/rules/ui-skill-routing.md`**
Thiết lập quy tắc định tuyến skill UI cho agent, cấm style stacking, bảo toàn token authority, cấm tự ý thêm dependency và yêu cầu bằng chứng thực tế trước khi hoàn thành.

- [ ] **Step 4: Cập nhật `docs/04-standards/README.md` và `docs/README.md`**
Liệt kê `ui-quality.md` vào bảng chuẩn chất lượng hệ thống.

---

### Task 4: Chuẩn hóa Root Docs & Context Files theo Kit Schema mới

**Files:**
- Modify: `CONTEXT.md`
- Modify: `PROJECT-OVERVIEW.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/README.md`

**Interfaces:**
- Consumes: Cấu trúc heading và frontmatter quy định trong Pass 3 của `check-kit.ps1`.
- Produces: Metadata và tài liệu hướng dẫn agent nhất quán, chuẩn xác.

- [ ] **Step 1: Cập nhật `CONTEXT.md`**
Thêm frontmatter YAML (`version`, `last-checked`, `scope`, `current-slice`) và bổ sung `Has UI Surface: True` cùng heading `## Boundary & Surface` và `## Canonical References`.

- [ ] **Step 2: Cập nhật `PROJECT-OVERVIEW.md`**
Bổ sung tham chiếu tới root `DESIGN.md` và `docs/04-standards/ui-quality.md` trong phần Architecture Direction / Constraints.

- [ ] **Step 3: Cập nhật `AGENTS.md`**
Đảm bảo các headings bắt buộc (`## Mission`, `## Authority Map`, `## Read Order`, `## Critical Invariants`), đánh số liên tục cho Read Order, bổ sung quy tắc định tuyến UI skills và quyền lực của `DESIGN.md`.

- [ ] **Step 4: Cập nhật `.agents/rules/README.md`**
Bổ sung mục giới thiệu và liên kết tới `.agents/rules/ui-skill-routing.md`.

---

### Task 5: Sửa các liên kết cũ hỏng & Chạy kiểm chứng toàn diện

**Files:**
- Modify: `.agents/manual-tests/unified-sidebar-conversations/slice-3-client-infinite-scroll.md`
- Modify: `.agents/manual-tests/unified-sidebar-conversations/slice-4-realtime-socket-sync.md`
- Modify: `docs/adr/004-message-shared-links-optimization.md`
- Modify: `docs/adr/005-conversation-panel-two-stage-loading.md`

**Interfaces:**
- Consumes: Báo cáo quét lỗi liên kết từ Pass 2 của `check-kit.ps1`.
- Produces: 100% liên kết nội bộ hợp lệ.

- [ ] **Step 1: Thay thế các link `file:///...` cũ bằng định dạng Markdown an toàn**
Thay thế các link tuyệt đối trỏ vào máy cục bộ cũ bằng tên tài liệu hoặc liên kết relative tương ứng.

- [ ] **Step 2: Chạy kiểm chứng toàn bộ 4 Pass của `check-kit.ps1`**
Chạy: `powershell -ExecutionPolicy Bypass -File scripts/check-kit.ps1 -Strict`
Kỳ vọng: Exit code 0, FAILED (0 errors found).
