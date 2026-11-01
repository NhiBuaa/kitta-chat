# Data Ownership Rules

## Purpose

Các rule này xác định hệ thống nào được sở hữu state bền vững và hệ thống nào chỉ là hạ tầng phụ trợ.

## Rules

- MongoDB là durable source of truth cho users, messages, friendships, groups, files, calls, và migration read models.
- Redis chỉ là cache/coordination; không được dùng làm source of truth cho dữ liệu nghiệp vụ.
- RabbitMQ chỉ xử lý background side effects; không được dùng làm nơi sở hữu state nghiệp vụ.
- Redis cache miss phải có đường recover/warm-up từ MongoDB khi dữ liệu là durable state.
- RabbitMQ worker có thể xử lý side effects nhưng không được quyết định trạng thái cuối cùng thay MongoDB.
- Không chuyển quyền sở hữu state từ MongoDB sang Redis/RabbitMQ nếu chưa có quyết định kỹ thuật rõ ràng.

## Examples

- Recent conversation cache trong Redis phải rebuild được từ MongoDB messages/friends.
- Presence mirror trong Redis có thể hết hạn mà không làm mất durable user data.
- Image/email/audit jobs có thể retry qua RabbitMQ, nhưng entity chính vẫn phải được lưu bền vững trong MongoDB khi cần.
