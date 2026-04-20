const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");
const { uploadSingleFile } = require("../services/s3.service");
const admin = require("../config/firebaseAdmin");
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

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công",
      user: userResponse,
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
      return res
        .status(400)
        .json({ success: false, message: "Email hoặc mật khẩu không đúng" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Email hoặc mật khẩu không đúng" });
    }

    user.activityStatus = {
      state: "active",
      lastSeen: new Date(),
    };
    await user.save();  

    
    // tạo token
    const token = jwt.sign({ id: user._id }, getJwtSecret(), {
      expiresIn: "1d",
    });

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        activityStatus: user.activityStatus,
      },
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
      let avatarUrl = defaultAvatarUrl;
      // chỉ tải avt lần đầu
      if (avatar) {
        try {
          const response = await axios.get(avatar, {
            responseType: "arraybuffer",
          });

          const buffer = Buffer.from(response.data, "binary");

          const fileName = `google-${Date.now()}.jpg`;

          avatarUrl = await uploadSingleFile(
            buffer,
            fileName,
            "image/jpeg",
            "avatars",
          );
        } catch (err) {
          console.error("Upload Google avatar failed:", err.message);
        }
      }
      user = new User({
        email: cleanEmail,
        displayName,
        avatar: avatarUrl,
        password: await bcrypt.hash("GOOGLE_LOGIN", 10),
        provider: "google",
      });

      await user.save();
    } else {
      // chỉ update nếu là google account
      if (user.provider === "google") {
        user.displayName = displayName || user.displayName;

        if (!user.avatar && avatar) {
          user.avatar = avatar;
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

    // 4. tạo tolen như login
    const jwtToken = jwt.sign({ id: user._id }, getJwtSecret(), {
      expiresIn: "1d",
    });

    // 5. gui ve fe
    res.json({
      success: true,
      message: "Đăng nhập bằng Google thành công",
      token: jwtToken,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        activityStatus: user.activityStatus,
      },
    });
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(401).json({
      success: false,
      message: "Token không hợp lệ",
    });
  }
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

    // Cấu hình Transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"KittaChat Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Yêu cầu đặt lại mật khẩu - KittaChat",
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: rgb(73, 145, 28); text-align: center;">Yêu cầu Reset Mật khẩu</h2>
                    <p>Xin chào <strong>${user.displayName}</strong>,</p>
                    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
                    <p>Vui lòng nhấn vào nút bên dưới để tạo mật khẩu mới (Link chỉ có hiệu lực trong 15 phút):</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: rgb(73, 145, 28); color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Đặt lại mật khẩu ngay
                        </a>
                    </div>

                    <p style="color: #666; font-size: 12px;">Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;">
                    <p style="text-align: center; color: #999; font-size: 12px;">Chat App Team</p>
                </div>
            `,
    };

    // Gửi mail------------------------------
    await transporter.sendMail(mailOptions);

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