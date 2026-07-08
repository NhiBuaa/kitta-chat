# Next Session — Slice 15: Runtime Confidence / Gradual Rollout

## Slice mục tiêu
Kích hoạt thử nghiệm (Staging/Shadow Run) cho Conversation Read Model bằng cách bật tính năng shadow compare, so sánh sự sai lệch giữa kết quả đọc của hệ thống cũ (legacy) và Read Model mới đối với dữ liệu sidebar, từ đó chuẩn bị cho việc chính thức đưa vào sử dụng.

## Bối cảnh
- Đã hoàn thành Slice 14: Đồng bộ vòng đời nhóm và trạng thái thành viên vào Conversation Read Model.
- Các flag `CONVERSATION_SHADOW_COMPARE_ENABLED` và `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED` hiện tại đang đặt mặc định là `false`.

## Mục tiêu cụ thể
- Kích hoạt flag `CONVERSATION_SHADOW_COMPARE_ENABLED=true` trong môi trường staging/kiểm thử để theo dõi log các sự sai lệch (mismatches).
- Bổ sung công cụ hoặc script lọc log để thống kê các lỗi mismatch phát hiện bởi `conversationShadowCompareService`.
- Tinh chỉnh các trường hợp sai lệch dữ liệu phổ biến (ví dụ: unread count lệch do cơ chế đếm khác nhau giữa direct/group chat) để chuẩn bị cho Slice 16 (Dọn dẹp mã nguồn cũ).

## Guardrails bắt buộc
- Tuyệt đối không thay đổi response thực tế trả về cho client trên môi trường production khi chưa có so sánh an toàn.
- Lỗi phát sinh trong quá trình so sánh shadow compare phải được log và swallow để không làm gián đoạn API của người dùng.