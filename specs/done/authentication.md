# Authentication

## Why

Người dùng cần đăng ký, đăng nhập, duy trì phiên làm việc an toàn, và khôi phục phiên sau khi refresh trình duyệt.

## Behavior

- Register tài khoản local bằng email, display name, password, confirm password.
- Login bằng email/password.
- Login bằng Google khi Firebase/Google credential được cấu hình.
- Access token được giữ trong memory phía frontend.
- Refresh session dùng HttpOnly refresh cookie.
- Logout kết thúc phiên hiện tại.
- Forgot password gửi luồng reset password qua email khi provider được cấu hình.
- Reset password bằng token hợp lệ.

## Done When

- User đăng ký thành công với dữ liệu hợp lệ.
- User đăng nhập thành công và gọi được protected API.
- Refresh trang vẫn khôi phục được session bằng refresh cookie.
- Logout làm mất quyền gọi protected API.
- Token/cookie không bị lưu dài hạn trong localStorage/sessionStorage.
- Forgot/reset password hoạt động khi email provider được cấu hình.
