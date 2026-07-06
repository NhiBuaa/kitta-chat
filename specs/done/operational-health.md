# Operational Health

## Why

Người vận hành và reviewer cần biết hệ thống đang sống, sẵn sàng, và các dependency chính đang ở trạng thái nào.

## Behavior

- `/healthz` báo process/backend health cơ bản.
- `/readyz` báo readiness có xét dependency như MongoDB, Redis, RabbitMQ theo semantics hiện có.
- `/ops` cung cấp thông tin operational phù hợp.
- Docker Compose healthchecks dùng cho service dependencies.
- nginx proxy route health/ready/ops endpoints.

## Done When

- Health endpoint trả thành công khi backend sống.
- Readiness phản ánh dependency degradation đúng.
- Docker Compose có thể chờ dependency healthy trước khi start services liên quan.
- Endpoint không lộ secret hoặc credential.
