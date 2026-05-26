const crypto = require("crypto");

const NOTIFICATION_EMAIL_QUEUE = "notification.email";

const normalizeEmail = (email) => {
  if (!email) throw new Error("Email notification job requires recipient");
  return String(email).trim().toLowerCase();
};

const buildPasswordResetEmailJob = ({
  to,
  displayName = "bạn",
  resetUrl,
  requestId = crypto.randomUUID(),
  correlationId,
}) => {
  if (!resetUrl) {
    throw new Error("Password reset email job requires resetUrl");
  }

  return {
    type: "email.password_reset",
    requestId,
    correlationId,
    to: normalizeEmail(to),
    template: "password_reset",
    subject: "Yêu cầu đặt lại mật khẩu - KittaChat",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: rgb(73, 145, 28); text-align: center;">Yêu cầu Reset Mật khẩu</h2>
        <p>Xin chào <strong>${displayName}</strong>,</p>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Vui lòng nhấn vào nút bên dưới để tạo mật khẩu mới. Link chỉ có hiệu lực trong 15 phút.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: rgb(73, 145, 28); color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Đặt lại mật khẩu ngay
          </a>
        </div>
        <p style="color: #666; font-size: 12px;">Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;">
        <p style="text-align: center; color: #999; font-size: 12px;">KittaChat Team</p>
      </div>
    `,
    createdAt: new Date().toISOString(),
  };
};

module.exports = {
  NOTIFICATION_EMAIL_QUEUE,
  buildPasswordResetEmailJob,
};
