# Notifications And Email Jobs

## Why

Một số side effects như email/reset password/notifications nên chạy ngoài request path chính để giảm latency và hỗ trợ retry.

## Behavior

- Notification/email jobs được publish vào RabbitMQ khi flow yêu cầu.
- Notification worker consume job và gửi qua provider được cấu hình.
- Job failure được xử lý theo retry/DLQ-oriented flow hiện có.
- Request/correlation id được preserve khi có thể để trace background work.

## Done When

- Email/notification job được enqueue đúng khi provider/queue sẵn sàng.
- Worker xử lý thành công job hợp lệ.
- Failure không làm crash worker loop vĩnh viễn.
- Retry/DLQ behavior có thể quan sát và test được.
