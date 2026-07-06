# Auth Session Rules

## Purpose

Các rule này bảo vệ session model và giảm rủi ro lộ token ở frontend.

## Rules

- Access token phía frontend phải giữ memory-only theo flow hiện tại.
- Không persist access token dài hạn trong `localStorage` hoặc `sessionStorage`.
- Session recovery dùng HttpOnly refresh cookie.
- Protected API phải yêu cầu auth middleware/token hợp lệ theo contract hiện có.
- Không log token, refresh cookie, password, hoặc credential provider.
- Google/Firebase/service credentials không được commit vào repo.

## Examples

- Sau refresh trình duyệt, client phải bootstrap lại session qua refresh-cookie flow thay vì đọc token từ localStorage.
- Debug auth không được in raw JWT hoặc refresh cookie ra log.
- File `firebase-service.json` là secret runtime, không phải artifact để commit.
