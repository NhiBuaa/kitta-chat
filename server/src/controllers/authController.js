const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("../config/firebaseAdmin");
const { queueRemoteAvatarProcessing } = require("../services/avatarQueueService");
const { queuePasswordResetEmail } = require("../services/passwordResetNotificationService");
const { sendError } = require("../utils/apiResponse");
const {
  buildAuthUser,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  issueAuthSession,
  verifyRefreshToken,
} = require("../services/authSessionService");
// Hàm helper để validate email
const validateEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
};
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;

// dang ky----------------------------------------
exports.register = async (req, res) => {
  try {
    const { displayName, email, password, confirmPassword } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    // Validate thông tin đăng ký
    if (!displayName || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập đủ thông tin" });
    }
    if (/\s/.test(email) || /\s/.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Email và mật khẩu không được chứa khoảng trắng",
      });
    }
    if (!validateEmail(cleanEmail)) {
      return res
        .status(400)
        .json({ success: false, message: "Email không hợp lệ" });
    }

    const userExists = await User.findOne({ email: cleanEmail });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "Email đã được sử dụng",
      });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt",
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu xác nhận không khớp",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&size=128`;
    const newUser = new User({
      // KHÔNG CÒN USERNAME
      email: cleanEmail,
      password: hashedPassword,
      displayName,
      avatar: defaultAvatarUrl,
    });

    await newUser.save();
    const authSession = issueAuthSession(res, newUser);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      token: authSession.token,
      user: authSession.user,
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// dang nhap------------------------------------------
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Tìm bằng email
    const user = await User.findOne({ email: cleanEmail });
    if (user && user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "Tài khoản này đăng nhập bằng Google",
      });
    }
    if (!user) {
      return sendError(res, {
        status: 400,
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, {
        status: 400,
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không đúng",
      });
    }

    user.activityStatus = {
      state: "active",
      lastSeen: new Date(),
    };
    await user.save();
    const authSession = issueAuthSession(res, user);

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token: authSession.token,
      user: authSession.user,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET chưa được cấu hình");
  }
  return process.env.JWT_SECRET;
};
// dnhap bang gg------------------------------------------
exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    let avatarQueueResult = null;

    // validate
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Thiếu Firebase token từ client",
      });
    }

    // Xác thực token từ Google
    const decoded = await admin.auth().verifyIdToken(token);

    const email = decoded.email;
    const displayName = decoded.name;
    const avatar = decoded.picture;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Token không hợp lệ",
      });
    }
    const cleanEmail = email.trim().toLowerCase();

    const defaultAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=22c55e&color=fff&size=128`;
    // 2. tim ng dung co email
    let user = await User.findOne({ email: cleanEmail });

    if (user && user.provider !== "google") {
      return res.status(400).json({
        success: false,
        message: "Email này đã đăng ký bằng mật khẩu",
      });
    }

    // 3. ch co thi tao moi
    if (!user) {
      user = new User({
        email: cleanEmail,
        displayName,
        avatar: defaultAvatarUrl,
        password: await bcrypt.hash("GOOGLE_LOGIN", 10),
        provider: "google",
      });

      await user.save();

      if (avatar) {
        avatarQueueResult = await queueRemoteAvatarProcessing({
          avatarUrl: avatar,
          userId: user._id,
          displayName,
          correlationId: req.requestId,
        });

        if (!avatarQueueResult.queued) {
          console.error("Queue Google avatar failed:", avatarQueueResult.error);
        }
      }
    } else {
      // chỉ update nếu là google account
      if (user.provider === "google") {
        user.displayName = displayName || user.displayName;

        if (!user.avatar && avatar) {
          user.avatar = defaultAvatarUrl;
          avatarQueueResult = await queueRemoteAvatarProcessing({
            avatarUrl: avatar,
            userId: user._id,
            displayName,
            correlationId: req.requestId,
          });

          if (!avatarQueueResult.queued) {
            console.error("Queue Google avatar failed:", avatarQueueResult.error);
          }
        }

        await user.save();
      }
    }

    // update online
    user.activityStatus = {
      state: "active",
      lastSeen: new Date(),
    };

    await user.save();
    const authSession = issueAuthSession(res, user);

    // 5. gui ve fe
    res.json({
      success: true,
      message: "Đăng nhập bằng Google thành công",
      token: authSession.token,
      user: authSession.user,
      avatarQueue: avatarQueueResult
        ? {
            queued: avatarQueueResult.queued,
            requestId: avatarQueueResult.requestId,
            queueError: avatarQueueResult.queueError || null,
          }
        : null,
    });
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(401).json({
      success: false,
      message: "Token không hợp lệ",
    });
  }
};


const findSessionUser = async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);

  if (!refreshToken) {
    sendError(res, {
      status: 401,
      code: "SESSION_REQUIRED",
      message: "Authentication session is required",
    });
    return null;
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    sendError(res, {
      status: 401,
      code: "INVALID_SESSION",
      message: "Authentication session is invalid or expired",
    });
    return null;
  }

  if (decoded.type !== "refresh" || !decoded.id) {
    sendError(res, {
      status: 401,
      code: "INVALID_SESSION",
      message: "Authentication session is invalid or expired",
    });
    return null;
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    sendError(res, {
      status: 401,
      code: "INVALID_SESSION",
      message: "Authentication session is invalid or expired",
    });
    return null;
  }

  return user;
};

exports.session = async (req, res) => {
  try {
    const user = await findSessionUser(req, res);
    if (!user) return;

    res.json({
      success: true,
      authenticated: true,
      user: buildAuthUser(user),
    });
  } catch (error) {
    console.error("Session Error:", error);
    sendError(res, {
      status: 500,
      code: "SESSION_ERROR",
      message: "Unable to read authentication session",
    });
  }
};

exports.refresh = async (req, res) => {
  try {
    const user = await findSessionUser(req, res);
    if (!user) return;

    const authSession = issueAuthSession(res, user);
    res.json({
      success: true,
      token: authSession.token,
      user: authSession.user,
    });
  } catch (error) {
    console.error("Refresh Error:", error);
    sendError(res, {
      status: 500,
      code: "REFRESH_ERROR",
      message: "Unable to refresh authentication session",
    });
  }
};

exports.logout = async (req, res) => {
  clearRefreshCookie(res);
  res.json({
    success: true,
    message: "Đăng xuất thành công",
  });
};

// quen mk------------------------------------------
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email.trim().toLowerCase();

    // Kiểm tra email có tồn tại không
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.json({
        success: true,
        message: `Nếu email tồn tại, chúng tôi đã gửi hướng dẫn`,
      });
    }

    const secret = process.env.JWT_SECRET + user.password;

    // Tạo token reset
    const resetToken = jwt.sign({ id: user._id, email: user.email }, secret, {
      expiresIn: "15m",
    });

    // Tạo nội dung Email
    const resetUrl = `${process.env.URL_FRONTEND}/reset-password/${user._id}/${resetToken}`;

    // Queue email để worker gửi qua RabbitMQ.
    const emailQueueResult = await queuePasswordResetEmail({
      user,
      resetUrl,
      correlationId: req.requestId,
    });

    if (!emailQueueResult.queued) {
      console.error("[ForgotPassword] queue email failed:", {
        userId: user._id?.toString?.() || user._id,
        email: cleanEmail,
        queue: "notification.email",
        error: emailQueueResult.error,
      });
    }

    return res.json({
      success: true,
      message: `Nếu email tồn tại, chúng tôi đã gửi hướng dẫn`,
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Lỗi Server: Không thể gửi email" });
  }
};

// resetPass------------------------------------------------
exports.resetPassword = async (req, res) => {
  try {
    // Lấy token từ URL
    const { id, token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    // check empty
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ mật khẩu",
      });
    }
    if (/\s/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu không được chứa khoảng trắng",
      });
    }
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt",
      });
    }
    // Validate cơ bản
    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu xác nhận không khớp" });
    }

    // Tìm user trong DB
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    }

    const secret = process.env.JWT_SECRET + user.password;

    try {
      jwt.verify(token, secret);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Link reset đã hết hạn hoặc không hợp lệ",
      });
    }

    const isSame = await bcrypt.compare(newPassword, user.password);

    if (isSame) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới không được trùng với mật khẩu cũ",
      });
    }

    // hash password mới
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({
      success: true,
      message: "Mật khẩu đã được thay đổi thành công!",
    });
  } catch (err) {
    console.error("Reset Password Error:", err);
    // Phân loại lỗi để báo cho client
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({
        success: false,
        message: "Link reset đã hết hạn. Vui lòng yêu cầu lại.",
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res
        .status(400)
        .json({ success: false, message: "Link reset không hợp lệ." });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};
