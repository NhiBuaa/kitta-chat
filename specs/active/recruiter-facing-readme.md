# PRD: Recruiter-Facing README

## Objective

Biến README của KittaChat thành một portfolio landing page giúp recruiter hiểu sản phẩm, xem demo và nhận ra năm điểm kỹ thuật chính trong vòng 60 giây.

## Primary Audience

- Recruiter hoặc hiring manager không cần đọc toàn bộ tài liệu kỹ thuật.
- Engineer reviewer muốn có đường dẫn nhanh đến kiến trúc, test evidence và local setup.

## Deliverables

1. Một câu mô tả sản phẩm rõ ràng.
2. CTA xem demo video dài 2–3 phút.
3. Screenshots và animation cho direct chat, group chat, Conversation Information Panel, audio/video call và unified realtime sidebar.
4. Architecture diagram dạng SVG.
5. Năm engineering highlights.
6. Test/build badges có nguồn dữ liệu trung thực.
7. Quick start bằng Docker Compose.
8. Demo accounts hoặc quy trình seed data an toàn.
9. Known limitations trung thực.

## Engineering Highlights

1. Horizontally scaled Socket.IO bằng Redis Adapter.
2. Idempotent message persistence bằng client-generated key.
3. MongoDB-gated call finalization.
4. Cursor-based unified sidebar pagination và batch enrichment.
5. RabbitMQ workers với retry, DLQ và correlation behavior.

## Verified Claim Boundaries

- Socket.IO scaling claim được giới hạn ở cross-replica event fan-out bằng Redis Adapter với 3 backend replicas trong Docker Compose; không claim multi-region hoặc autoscaling orchestration.
- Message persistence được mô tả là retry-safe/idempotent theo cặp `(sender, idempotencyKey)` do client sinh; không dùng thuật ngữ `exactly-once delivery`.
- Call finalization được mô tả là shared MongoDB-gated finalization cho các termination path chính; repository vẫn có emergency fallback path và không được marketing như mọi nhánh đều tuyệt đối đi qua một gate duy nhất.
- Unified Sidebar được mô tả là cursor-based pagination với ObjectId tie-breaker và batch enrichment để tránh per-item N+1; không claim chính xác chỉ có hai database queries.
- RabbitMQ claim bao gồm durable primary/retry/DLQ topology, delayed retry, poison-message handling, correlation propagation và bounded attempts; RabbitMQ vẫn chỉ xử lý background side effects.

## Engineering Highlight Presentation

Mỗi Engineering Highlight sử dụng cùng một cấu trúc:

- `Problem`
- `Design`
- `Evidence`

Mỗi highlight dài khoảng 40–60 từ, chỉ giới thiệu quyết định và giá trị kỹ thuật. README không chứa quá nhiều implementation detail; nội dung chuyên sâu được dẫn tới tài liệu hoặc source tương ứng.

Thứ tự ưu tiên cho Evidence:

1. Design Doc hoặc ADR.
2. PRD nếu phù hợp.
3. Source Code.
4. Tests.

Các tiêu đề đã chốt:

1. `Cross-Replica Realtime Delivery`
2. `Retry-Safe Message Persistence`
3. `MongoDB-Gated Call Finalization`
4. `Scalable Conversation Sidebar`
5. `Resilient Background Job Processing`

## Resolved Decisions

### Opening Narrative

README mở đầu theo flow `Product → Value → Engineering`, không đưa horizontal scaling trực tiếp vào tagline.

Product tagline:

> KittaChat is a full-stack realtime communication platform for direct messaging, group collaboration, file sharing, presence, and WebRTC audio/video calls.

Engineering positioning:

> Built as a production-oriented engineering project focused on scalable realtime systems, event-driven architecture, and distributed backend design.

Thứ tự nội dung ngay sau phần mở đầu:

1. Demo.
2. Architecture Diagram.
3. Engineering Highlights.

Chi tiết horizontal scaling được trình bày trong Architecture Diagram và Engineering Highlights thay vì lặp lại trong tagline.

### README Section Order

README kể câu chuyện theo flow `Product → Demo → Engineering Decisions → Architecture → Setup`:

1. `Hero`
   - Logo, product tagline, engineering positioning và Tests/Build badges.
2. `Watch the Demo`
   - Google Drive CTA, duration, ngày quay và commit được demo.
3. `Product Tour`
   - Realtime GIF, UI screenshots và English captions.
4. `Engineering Highlights`
   - Năm highlights theo `Problem → Design → Evidence`.
5. `Architecture`
   - Recruiter-level SVG và Optional External Integrations.
6. `Quick Start`
   - Docker Compose source-of-truth flow và convenience command `npm run demo`.
7. `Demo Accounts`
8. `Testing`
9. `Known Limitations`
10. `Technical Documentation`

Engineering Highlights xuất hiện trước Architecture Diagram để người đọc hiểu các quyết định và giá trị kỹ thuật trước khi đọc sơ đồ hệ thống.

### Demo Delivery

- Không có live deployment trong phạm vi hiện tại.
- Tạo mới video demo dài 2–3 phút làm CTA chính của README.
- Host video trên Google Drive; YouTube có thể được dùng về sau nếu cần.
- Quyền truy cập Google Drive bắt buộc là `Anyone with the link — Viewer`.
- Link phải được kiểm tra trong cửa sổ ẩn danh trước khi công bố.
- README hiển thị thumbnail hoặc screenshot có CTA rõ ràng thay vì URL thô.
- Quay product footage sạch trước, sau đó bổ sung AI-generated English narration và English captions trong khâu hậu kỳ.
- Narration script phải dùng cùng terminology với README và Engineering Highlights.
- Captions cần đủ để hiểu video khi tắt âm thanh; không phụ thuộc riêng vào voice-over.
- Video theo hướng product-first; không quay terminal, RabbitMQ management UI hoặc công cụ hạ tầng.

Storyboard mục tiêu:

1. `0:00–0:10 — Product introduction`
   - Logo, tagline và hai cửa sổ đăng nhập.
2. `0:10–0:35 — Direct messaging`
   - Realtime message, optimistic UI và delivery.
3. `0:35–1:00 — Realtime sidebar`
   - Incoming message, unread increment, conversation reorder, filter chips và infinite scroll.
4. `1:00–1:20 — Group collaboration`
   - Group message, sender identity và realtime update.
5. `1:20–1:50 — Conversation Information Panel`
   - Metadata, members, Shared Media/Files/Links, View All, infinite scroll, Freshness Banner và Media Lightbox.
6. `1:50–2:10 — WebRTC Call`
   - Start, accept, toggle media và end call.
7. `2:10–2:30 — Engineering closing`
   - Architecture Diagram, five Engineering Highlights, GitHub Actions Tests/Build và links tới source/documentation.

Realtime Sidebar được đưa vào 60 giây đầu để phân biệt KittaChat với chat CRUD thông thường. Conversation Information Panel được dành thêm thời lượng vì là capability nổi bật của sản phẩm.

### Demo Data

- Tạo một demo seed riêng, an toàn cho reviewer và idempotent.
- Chỉ dùng identity giả thuộc miền `.test`; không dùng dữ liệu cá nhân hoặc credential thật.
- Dataset phải có ít nhất hai tài khoản đăng nhập, direct chat, group chat, pinned/unread state và đủ conversations để thể hiện pagination.
- Dataset có ít nhất 20 conversations; cấu hình mặc định tạo 24 conversations.
- Seed không xóa/reset dữ liệu hiện có và phải từ chối chạy ngoài môi trường local/Compose nếu chưa có explicit opt-in.
- Mật khẩu demo có thể là giá trị giả công khai, không được tái sử dụng từ credential thật.

Demo accounts mặc định:

- `alice@kittachat.test`
- `bob@kittachat.test`
- Shared local-only password: `KittaChatDemo!2026`

Dataset chính:

- Alice và Bob là bạn bè và có direct conversation với lịch sử tin nhắn.
- Group `Backend Team` gồm Alice, Bob và ba thành viên giả.
- Có ít nhất hai pinned conversations và nhiều mức unread khác nhau.
- Direct conversation Alice–Bob có ít nhất 8 media items, 5 files và 5 links để thể hiện View All, infinite scroll, Freshness Banner và Media Lightbox.
- Media demo dùng local neutral assets và không phụ thuộc S3/CloudFront.
- Call history không cần seed; cuộc gọi được tạo trực tiếp trong lúc quay demo.

Edge-case conversations:

- Empty conversation không có media/file/link.
- Media-only conversation.
- Files-only conversation.
- Links-only conversation.
- Long-history conversation có khoảng 50–100 messages.

Demo seed acceptance criteria:

- Upsert toàn bộ identities thuộc namespace `.test`.
- Không tạo duplicate conversations.
- Không tạo duplicate messages.
- Không xóa dữ liệu ngoài namespace demo.
- Có thể chạy nhiều lần và tạo cùng một kết quả logic.

### README Assets

Tất cả asset được lưu tại `docs/assets/readme/`:

- `architecture.svg`
- `direct-chat.webp`
- `group-chat.webp`
- `conversation-panel.webp`
- `video-call.webp`
- `realtime-sidebar.gif`

Quy ước định dạng:

- Architecture Diagram dùng SVG để hiển thị sắc nét trên GitHub và dễ bảo trì.
- UI screenshots dùng WebP.
- Chỉ dùng một GIF cho realtime sidebar.
- GIF dài khoảng 5–8 giây, mục tiêu dưới 5 MB, chỉ minh họa incoming message, unread count và conversation reorder.
- Full product demo được trình bày bằng video bên ngoài repository.

### Demo Language And Captions

- Nếu ứng dụng có i18n hoặc language switch chính thức, ưu tiên quay bằng English UI.
- Nếu ứng dụng chưa có i18n, giữ nguyên UI tiếng Việt và không tạo bản dịch tạm chỉ để quay demo.
- Khi dùng UI tiếng Việt:
  - Chỉ quay màn hình có ít văn bản.
  - Tránh dialog hoặc màn hình chứa đoạn tiếng Việt dài.
  - Dùng identity và dữ liệu trung tính như Alice, Bob hoặc Backend Team.
- English narration, captions và callouts phải giải thích cả hành động lẫn engineering value.
- Callout vocabulary ưu tiên các cụm như `Realtime Conversation Reordering`, `Shared Media Explorer with Cursor-based Pagination`, `WebRTC Peer-to-Peer Audio Call` và `Cross-Replica Realtime Delivery`.
- Mỗi screenshot trong README có một English caption ngắn mô tả giá trị của capability, không chỉ lặp lại tên màn hình.

Caption đã chốt:

- `direct-chat.webp`: `Optimistic direct messaging with retry-safe persistence.`
- `group-chat.webp`: `Realtime group collaboration with sender-aware message previews.`
- `conversation-panel.webp`: `Shared resource explorers with cursor pagination and freshness notifications.`
- `video-call.webp`: `Peer-to-peer WebRTC calls coordinated through Socket.IO signaling.`
- `realtime-sidebar.gif`: `Unread-aware conversation reordering across direct and group chats.`
- `architecture.svg`: `Three Socket.IO replicas coordinate through Redis while MongoDB owns durable state and RabbitMQ handles background work.`

### Architecture Diagram

- README chỉ có một architecture diagram ở mức recruiter-level.
- Diagram tập trung vào React Client, nginx Reverse Proxy, Express + Socket.IO chạy 3 replicas, Redis Adapter, RabbitMQ, Background Workers, MongoDB và WebRTC media trực tiếp giữa hai client.
- Diagram phải thể hiện Socket.IO chỉ đảm nhiệm signaling cho WebRTC, không vận chuyển media.
- HTTP request, realtime Socket.IO và asynchronous RabbitMQ flows phải được phân biệt bằng màu sắc hoặc kiểu mũi tên khác nhau.
- Không đưa AWS S3/CloudFront, SMTP hoặc Firebase vào diagram, kể cả dưới dạng nét đứt.

Ngay bên dưới diagram, README có mục riêng:

`Optional External Integrations`

- AWS S3 + CloudFront cho media storage và delivery.
- SMTP cho email notifications.
- Firebase Cloud Messaging cho push notifications.

### Test And Build Badges

- README chỉ hiển thị hai badge động lấy trực tiếp từ GitHub Actions trên nhánh `main`: `Tests` và `Build`.
- Không sử dụng badge ghi cứng số lượng test vì số liệu sẽ nhanh lỗi thời.
- Tách workflow theo trách nhiệm để có cấu trúc mở rộng:
  - `.github/workflows/tests.yml`
  - `.github/workflows/build.yml`
- `tests.yml` chạy toàn bộ Server Tests và Client Tests hiện có.
- `build.yml` chạy Client Production Build.
- Cấu trúc cho phép bổ sung độc lập `lint.yml`, `docker.yml`, `security.yml` và `release.yml` về sau mà không phải tổ chức lại workflow hiện tại.

### Docker Compose Quick Start

- Docker Compose là source of truth cho quy trình khởi động demo.
- README trình bày flow chuẩn trước:
  1. Chuẩn bị `server/.env`.
  2. Chạy `docker compose up -d --build`.
  3. Chạy `npm run seed:demo`.
- Ngay sau flow chuẩn, README có mục `Prefer a one-command setup?` giới thiệu `npm run demo` như convenience command.
- `npm run demo` chỉ bao bọc các bước chuẩn và phải:
  - Tạo `server/.env` nếu chưa tồn tại.
  - Sinh local-only secrets mà không in giá trị.
  - Không bao giờ ghi đè `server/.env` đã tồn tại.
  - Chạy Docker Compose.
  - Chờ hệ thống đạt trạng thái ready.
  - Chạy idempotent `seed:demo`.
- Khi wrapper gặp lỗi, reviewer vẫn có thể dùng các lệnh Docker Compose tiêu chuẩn để chẩn đoán và khởi động thủ công.

## Open Decisions

- Dataset và storyboard chính xác dùng để quay video/chụp ảnh.
- Phạm vi chỉnh sửa README so với các tài liệu kỹ thuật hiện có.

## Safety Constraints

- Không commit secret, credential thật, Firebase service account hoặc file `.env`.
- Không dùng dữ liệu cá nhân hoặc tài khoản thật làm demo data.
- Seed demo không được mặc định ghi vào database ngoài môi trường local/demo.
- Mọi claim kỹ thuật và số liệu test phải có bằng chứng kiểm chứng được trong repository hoặc CI.

## Known Starting Gaps

- Repository chưa có public demo URL hoặc demo video.
- Repository chỉ có logo, chưa có screenshots/GIF phục vụ portfolio.
- README hiện có placeholder cho screenshots.
- Seed hiện tại chứa identity được hardcode và external asset, không phù hợp làm reviewer-safe demo seed.
- README chưa dẫn recruiter qua năm engineering highlights theo thứ tự ưu tiên của K1.

## Known Limitations Presentation

Nguyên tắc diễn đạt:

- Mô tả đúng phạm vi hiện tại.
- Không xin lỗi.
- Không dùng từ ngữ mang sắc thái tiêu cực như `unfortunately`, `still missing` hoặc `lacking`.
- Khi phù hợp, kết thúc bằng định hướng phát triển trong tương lai.

Các limitation đã chốt:

1. **No hosted public environment** — The product demo is currently provided through a recorded walkthrough and a reproducible local Docker Compose setup.
2. **Deployment focuses on local reproducibility** — The project demonstrates horizontal scaling with Docker Compose. Production orchestration, for example Kubernetes, is intentionally outside the current scope.
3. **Optional providers require configuration** — AWS S3/CloudFront, SMTP and Firebase integrations require reviewer-provided credentials to run end-to-end.
4. **Production observability has a focused scope** — The current stack provides health, readiness and operational endpoints plus application logs; a full metrics and distributed tracing stack is a future extension.
5. **Verification is layered but not browser-E2E automated** — Current verification focuses on unit tests, integration tests, production builds and multi-client manual smoke testing. Automated browser E2E testing is planned for a future iteration.

## Completion Criteria

- Recruiter hiểu sản phẩm và năm điểm kỹ thuật chính trong vòng 60 giây.
- Có một CTA xem demo hoạt động mà không cần đọc setup guide.
- Video Google Drive mở được trong cửa sổ ẩn danh.
- Không có secret hoặc credential thật trong repository.
- Docker Compose quick start và demo data path được kiểm chứng từ fresh clone.

## Approved Implementation Issues

1. [#8 Create a reproducible seeded demo environment](https://github.com/NhiBuaa/kitta-chat/issues/8)
   - Blocked by: None.
   - Triage: `ready-for-agent`.
2. [#9 Expose trustworthy Tests and Build status](https://github.com/NhiBuaa/kitta-chat/issues/9)
   - Blocked by: None.
   - Triage: `ready-for-agent`.
3. [#10 Publish the recruiter engineering narrative](https://github.com/NhiBuaa/kitta-chat/issues/10)
   - Blocked by: #8 and #9.
   - Triage: `ready-for-agent`.
4. [#11 Publish the visual product tour](https://github.com/NhiBuaa/kitta-chat/issues/11)
   - Blocked by: #8.
   - Triage: `ready-for-agent`.
5. [#12 Publish the narrated demo and final recruiter README](https://github.com/NhiBuaa/kitta-chat/issues/12)
   - Blocked by: #9, #10 and #11.
   - Triage: `ready-for-human`.
