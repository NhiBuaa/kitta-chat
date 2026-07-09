# Background Workers

## Why

Các tác vụ nặng hoặc side effects không nên block request/socket path chính.

## Behavior

- Image worker xử lý image/avatar jobs.
- Notification worker xử lý email/notification jobs.
- Audit worker xử lý audit/statistics jobs.
- Workers kết nối RabbitMQ và dùng queue tương ứng.
- Workers có retry/DLQ/poison-message semantics theo flow hiện có.
- Workers không sở hữu durable business state thay MongoDB.

## Done When

- Worker start được trong Docker Compose.
- Job hợp lệ được consume và xử lý.
- Job lỗi có retry/DLQ behavior an toàn.
- Correlation/request id được propagate khi có.
- Worker failure không làm backend HTTP/Socket.IO mất khả năng start.
