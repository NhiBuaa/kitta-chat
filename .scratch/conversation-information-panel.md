# Task Checklist — Conversation Information Panel

- [x] **Slice 0: Infrastructure, ADRs & Base Skeletons**
  - [x] Tạo tài liệu `docs/adr/004-message-shared-links-optimization.md`
  - [x] Tạo tài liệu `docs/adr/005-conversation-panel-two-stage-loading.md`
  - [x] Thêm Feature Flags vào cấu hình/biến môi trường backend
  - [x] Tạo base controller skeleton, route skeleton và rate limiter cho Panel API
  - [x] Viết test tích hợp và chạy regression test
- [/] **Slice 1: Permission Service & UI Panel Base Layout**
  - [ ] Thiết lập Permission Service (backend)
  - [ ] Thiết lập UI Panel Base Layout (frontend)
  - [ ] Viết tests cho Permission Service
- [ ] **Slice 2: Overview & Preference Domain (Metadata - Giai đoạn 1)**
- [ ] **Slice 3: Shared Media Domain (Resources - Giai đoạn 2)**
- [ ] **Slice 4: Shared Files & Links Domain (Resources - Giai đoạn 2)**
- [ ] **Slice 5: Conversation Membership Domain (Read model & Cache)**
- [ ] **Slice 6: Conversation Action Domain (Write orchestrators)**
- [ ] **Slice 7: Realtime Sync & Client State**
