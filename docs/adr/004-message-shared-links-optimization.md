# ADR-004: Message Shared Links Optimization

## Status
Accepted

## Context
Khi hiển thị danh sách Shared Links trong Conversation Information Panel, hệ thống cần trích xuất các URL được chia sẻ trước đó trong các tin nhắn text của cuộc trò chuyện. 
Nếu thực hiện quét Regex (ví dụ: `https?://...`) trực tiếp trên toàn bộ trường `text` của collection `Message` mỗi khi mở panel, MongoDB sẽ phải thực hiện quét toàn bộ chỉ mục (index scan) hoặc quét toàn bộ bảng (full scan) rất nặng nề, làm suy giảm hiệu năng hệ thống khi lượng dữ liệu tin nhắn lớn.

## Decision
1. Mở rộng `Message` schema bằng việc bổ sung hai trường được tiền xử lý:
   * `hasLink: { type: Boolean, default: false }`
   * `links: [{ url: String, hostname: String }]`
2. Tạo chỉ mục tối ưu trên `Message`: `{ conversationId: 1, hasLink: 1, _id: -1 }`.
3. Khi lưu tin nhắn mới (hoặc cập nhật tin nhắn), backend sẽ chạy một bộ lọc Link Parser:
   * Phát hiện URL bằng Regex cơ bản.
   * Sử dụng thư viện chuẩn của Node.js là `new URL()` để phân tích cú pháp của URL.
   * Chuẩn hóa `hostname` thu được về chữ thường (`hostname.toLowerCase()`) và loại bỏ phần `www.` thừa nếu có.
   * Nếu URL không hợp lệ khiến parser ném ra ngoại lệ, ngoại lệ đó phải được **bỏ qua và không làm gián đoạn luồng lưu trữ tin nhắn (skipped and do not fail message persistence)**.
4. Truy vấn Shared Links trên Panel chỉ cần tìm các tin nhắn có `{ conversationId, hasLink: true }` và sắp xếp theo `{ _id: -1 }` (Canonical ordering: newest Message._id first) để đạt tốc độ phản hồi gần như tức thì.

## Consequences
* Tốc độ truy vấn Shared Links đạt mức ổn định $O(1)$ round-trips cơ sở dữ liệu.
* Dung lượng của mỗi document `Message` tăng lên rất ít (chỉ lưu URL và hostname của các tin nhắn có link).
* Không gây ra regression cho luồng gửi tin nhắn hiện tại nhờ cơ chế catch-and-ignore các lỗi phân tích URL lỗi.

## References
* [PRD: Conversation Information Panel](file:///d:/Developer/Projects/shotter/shot-chat/specs/active/conversation-information-panel.md)
* [Implementation Plan](file:///C:/Users/Nhi/.gemini/antigravity/brain/1cae5bf1-75e0-4d6c-a299-137bc6b489d3/implementation_plan.md)
